// lambda/s3-event-handler/index.ts
import { S3Event, Context } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import {
  checkIfDocumentExists,
  putNewDocumentRecord,
  sendMessageToSQS,
} from "../common/helper-functions";
import { DocumentMetadata } from "../common/types";

const processRecord = async (
  record: AWSLambda.S3EventRecord
): Promise<void> => {
  try {
    const s3Object = record.s3.object;
    const s3Key = decodeURIComponent(s3Object.key.replace(/\+/g, " "));

    // Extract the documentId from the s3Key
    const keyParts = s3Key.split("/");
    let documentId: string;

    if (keyParts.length >= 3) {
      documentId = keyParts[2]; // Extracted documentId
    } else {
      documentId = uuidv4(); // Generate a new UUID
    }

    // Idempotency Check
    const exists = await checkIfDocumentExists(documentId);
    if (exists) {
      console.log(
        `Document ${documentId} already exists. Skipping processing.`
      );
      return;
    }

    // Create document metadata
    const metadata: DocumentMetadata = {
      documentId,
      s3Key,
      status: "UPLOADED",
      uploadTime: new Date().toISOString(),
    };

    // Insert new record into DynamoDB
    await putNewDocumentRecord(metadata);

    // Send message to SQS
    await sendMessageToSQS(documentId, s3Key);

    console.log(`Document ${documentId} enqueued for processing.`);
  } catch (error) {
    console.error("Error processing S3 event record:", error);
  }
};

// Main Handler Function
export const handler = async (
  event: S3Event,
  context: Context
): Promise<void> => {
  const promises = event.Records.map((record) => processRecord(record));
  await Promise.all(promises);
};
