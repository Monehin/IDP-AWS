import { SQSEvent } from "aws-lambda";
import * as AWS from "aws-sdk";

const stepFunctions = new AWS.StepFunctions();

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const { documentId, s3Key } = body;

      // Start Step Functions execution
      await stepFunctions
        .startExecution({
          stateMachineArn: STATE_MACHINE_ARN,
          input: JSON.stringify({ documentId, s3Key }),
        })
        .promise();
    } catch (error) {
      console.error("Error processing SQS message:", error);
      // Optionally handle the error or send to DLQ
    }
  }
};
