import { Context } from "aws-lambda";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { Block } from "@aws-sdk/client-textract";

import { dynamoDBClient } from "../common/aws-clients";
import { DYNAMODB_TABLE, S3_BUCKET } from "../common/environment";
import { LambdaEvent } from "../common/types";
import {
  updateDynamoDBStatus,
  getS3Object,
  analyzeDocument,
  detectEntities,
} from "../common/helper-functions";

export const handler = async (
  event: LambdaEvent,
  context: Context
): Promise<void> => {
  const { documentId, s3Key } = event;

  // Input Validation
  if (!documentId || !s3Key) {
    console.error("Invalid input: documentId and s3Key are required");
    return;
  }

  try {
    // Idempotency Check: Verify if the document has already been processed
    const existingItem = await dynamoDBClient.send(
      new GetItemCommand({
        TableName: DYNAMODB_TABLE,
        Key: { documentId: { S: documentId } },
      })
    );

    if (
      existingItem.Item &&
      existingItem.Item.status &&
      existingItem.Item.status.S === "PROCESSED"
    ) {
      console.log(
        `Document ${documentId} has already been processed. Skipping processing.`
      );
      return; // Exit the function to prevent re-processing
    }

    // Update DynamoDB status to PROCESSING
    await updateDynamoDBStatus({
      TableName: DYNAMODB_TABLE,
      Key: { documentId: { S: documentId } },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": { S: "PROCESSING" } },
    });

    // Get the object from S3
    const documentBytes = await getS3Object(S3_BUCKET, s3Key);

    // Analyze Document with Textract
    const textractResult = await analyzeDocument(documentBytes);

    // Extract text blocks with type annotations
    const textBlocks = textractResult.Blocks?.filter(
      (block: Block) => block.BlockType === "LINE"
    ).map((block: Block) => block.Text || "");

    const fullText = textBlocks?.join(" ") || "";

    // Detect Entities with Comprehend
    const comprehendEntitiesResult = await detectEntities(fullText);

    // Update DynamoDB with processing results
    await updateDynamoDBStatus({
      TableName: DYNAMODB_TABLE,
      Key: { documentId: { S: documentId } },
      UpdateExpression:
        "SET #status = :status, processedTime = :processedTime, textractData = :textractData, comprehendEntities = :comprehendEntities",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": { S: "PROCESSED" },
        ":processedTime": { S: new Date().toISOString() },
        ":textractData": { S: JSON.stringify(textractResult) },
        ":comprehendEntities": {
          S: JSON.stringify(comprehendEntitiesResult.Entities),
        },
      },
    });
  } catch (error: any) {
    console.error("Error processing document:", error);

    // Update DynamoDB status to ERROR
    try {
      await updateDynamoDBStatus({
        TableName: DYNAMODB_TABLE,
        Key: { documentId: { S: documentId } },
        UpdateExpression: "SET #status = :status, errorMessage = :errorMessage",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": { S: "ERROR" },
          ":errorMessage": { S: error.message || "Unknown error" },
        },
      });
    } catch (dynamoError) {
      console.error(
        "Failed to update DynamoDB with error status:",
        dynamoError
      );
    }
  }
};
