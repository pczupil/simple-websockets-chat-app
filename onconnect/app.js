// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

var AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION });
var DDB = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

class ChannelManager {
  constructor() {
    this.channels = this.getChannels();
  }

  getChannels() {
    var getParams = {
      TableName: process.env.CHANNEL_TABLE_NAME
    };
    return DDB.scan(getParams);
  }

  getOpenChannels() {
    var getParams = {
      TableName: process.env.CHANNEL_TABLE_NAME,
      FilterExpression: "open = true",
    };
    return DDB.scan(getParams);
  }

  lockChannel(channelNum, callback) {
    var putParams = {
      TableName: process.env.CHANNEL_TABLE_NAME,
      Key: {
        N: `${channelNum}`
      },
      ExpressionAttributeValues: {
        ":channelNum": {
          N: channelNum
        }
      },
      FilterExpression: "channelNum = :channelNum",
      UpdateExpression: "SET open = false, "
    };
    var err = DDB.updateItem(putParams, function (err) {
      callback(null, {
        statusCode: err ? 500 : 200,
        body: err ? "Failed to lock channel: " + JSON.stringify(err) : "Channel locked."
      }
    });
  }
}

exports.handler = function (event, context, callback) {
  var putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      connectionId: { S: event.requestContext.connectionId },
      connectTime: { S: Date() }
    }
  };

  DDB.putItem(putParams, function (err) {
    callback(null, {
      statusCode: err ? 500 : 200,
      body: err ? "Failed to connect: " + JSON.stringify(err) : "Connected."
    });
  });
};
