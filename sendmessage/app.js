// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });

// We gon talk to Lex boy
var lexruntime = new AWS.LexRuntime();

const { TABLE_NAME } = process.env;

exports.handler = async (event, context, callback) => {
  let connectionData;
  
  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME, ProjectionExpression: 'connectionId' }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  
  const postData = JSON.parse(event.body).data;
  const message = postData.message;
  console.log(message);
  var putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      connectionId: { S: event.requestContext.connectionId },
      connectTime: { S: Date() },
      chatMessage: { S: message }
    }
  };
  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(postData) }).promise();
      ddb.put(putParams, function (err) {
        callback(null, {
          statusCode: err ? 500 : 200,
          body: err ? "Failed to send: " + JSON.stringify(err) : "Sent."
        });
      });
      
      var sessionAttrs = {
        'connectionId': connectionId
      };
      var lexResp = {};
      var lexParams = {
        botAlias: '$LATEST', /* required */
        botName: 'XTwoEngineChatBot', /* required */
        userId: 'pczupil', /* required */
        inputText: postData.message,
        sessionAttributes: sessionAttrs
      };
      await lexruntime.postText(lexParams, function(err, data) {
        if (err) {
          console.log(err, err.stack);
        } else {
          lexResp.message = data.message;
          lexResp.fromLex = 1;
          if (data.responseCard !== undefined) lexResp.respCard = data.responseCard;
          console.log("Data from LEX:");
          console.log(data);
        }
      }).promise();
      console.log("Response from LEX:");
      console.log(lexResp);
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: JSON.stringify(lexResp) }).promise();
      
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};
