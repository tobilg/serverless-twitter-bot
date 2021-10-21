import { SNS } from 'aws-sdk';
import Logger from './lib/logger';
import { repos  } from './lib/repos';

// Instantiate logger
const logger = new Logger();

// Instantiate SQS
const sns = new SNS();

const {
  HISTORY_REPO_QUERIES_TOPIC_ARN
} = process.env;

// eslint-disable-next-line import/prefer-default-export
export const handler = async (event, context) => {
  const requestLogger = logger.child({ requestId: context.awsrequestId });
  requestLogger.debug({ event, context });

  const repoQueries = repos.map(repo => sns.publish({
    Message: JSON.stringify(repo),
    TopicArn: HISTORY_REPO_QUERIES_TOPIC_ARN,
  }).promise());
  requestLogger.debug({ repoQueryCount: repoQueries.length });

  const publishMessagesResponse = await Promise.all(repoQueries);
  requestLogger.debug({ publishMessagesResponse });

  return;
}
