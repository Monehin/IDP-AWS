# Intelligent Document Processing Solution with AWS

This repository contains an implementation of a scalable, secure, and efficient document processing solution using AWS services. The solution allows users to upload documents via a web interface, processes them asynchronously using AWS Lambda, Amazon Textract, and Amazon Comprehend, and provides real-time status updates and results.

This project was inspired by [AWS's Intelligent Document Processing Solution](https://aws.amazon.com/solutions/guidance/intelligent-document-processing-on-aws/?did=sl_card&trk=sl_card), which provides a reference architecture for building similar document processing pipelines.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Backend Setup](#backend-setup)
- [Directory Structure](#directory-structure)
- [Usage](#usage)

## Introduction

This solution provides an end-to-end document processing system that leverages AWS serverless technologies. It allows users to upload documents (PDFs, images) via a web interface, processes them to extract structured and unstructured data, and provides real-time feedback and results to the user.

## Features

- **Secure Document Upload**: Users can securely upload documents using pre-signed URLs.
- **Asynchronous Processing**: Documents are processed asynchronously, improving scalability and user experience.
- **Data Extraction**: Extracts text, forms, and tables from documents using Amazon Textract.
- **Natural Language Processing**: Identifies entities and classifies documents using Amazon Comprehend.
- **Real-Time Updates**: Provides real-time status updates and results to users via GraphQL subscriptions.
- **User Authentication**: Secure authentication using Amazon Cognito.
- **Scalable Architecture**: Designed to handle variable workloads efficiently.
- **Infrastructure as Code**: AWS CDK and AWS Amplify Gen 2 used for resource provisioning.

## Architecture Overview

### Components

- **API Layer**: AWS AppSync GraphQL API for secure communication between frontend and backend.
- **Authentication**: Amazon Cognito User Pool for user sign-up and sign-in.
- **Document Storage**: Amazon S3 bucket for storing uploaded documents.
- **Processing Queue**: Amazon SQS queue to decouple upload and processing workflows.
- **Workflow Orchestration**: AWS Step Functions to manage the document processing workflow.
- **Processing Functions**: AWS Lambda functions to handle upload, processing, and SQS message consumption.
- **Data Extraction Services**: Amazon Textract and Amazon Comprehend for data extraction and NLP tasks.
- **Data Storage**: Amazon DynamoDB for storing document metadata and processing results.

## Prerequisites

- **AWS Account**: An active AWS account with permissions to create the necessary resources.
- **AWS CLI**: Installed and configured with your AWS credentials.
- **Node.js**: Version 14.x or higher.
- **AWS CDK**: Installed globally (`npm install -g aws-cdk`).
- **AWS IAM Permissions**: Permissions to deploy AWS CDK stacks.

## Setup Instructions

### Backend Setup

#### Clone the Repository

```bash
git clone https://github.com/your-username/aws-document-processing-solution.git
cd aws-document-processing-solution
```

## Directory Structure

```bash
aws-document-processing-solution/
├── amplify/
├── bin/
│   └── document-processing.ts
├── graphql/
│   └── schema.graphql
├── cdk.json
├── lambda/
│   ├── common/
│   │   ├── aws-client.ts
│   │   ├── environment.ts
│   │   ├── helper-function.ts
│   │   └── types.ts
│   ├── processing-handler/
│   │   └── index.ts
│   ├── queue-processing-handler/
│   │   └── index.ts
│   ├── s3-event-handler/
│   │   └── index.ts
│   └── upload-handler/
│       └── index.ts
├── lib/
│   └── document-processing-stack.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Usage

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template
