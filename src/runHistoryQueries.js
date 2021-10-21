import Logger from './lib/logger';
import { createRepoVersionRequest, getRepoHistoryDataQL, runBatchRequests } from './lib/repos';

// Instantiate logger
const logger = new Logger();

// eslint-disable-next-line import/prefer-default-export
export const handler = async (event, context) => {
  const requestLogger = logger.child({ requestId: context.awsrequestId });
  requestLogger.debug({ event, context });

  const repoConfiguration = JSON.parse(event.Records[0].Sns.Message);

  // Get all repo versions based on the repo configuration
  const repoVersions = await getRepoHistoryDataQL(repoConfiguration);

  // Create repo version requests
  const requests = repoVersions.map(repoVersion => createRepoVersionRequest(repoConfiguration, repoVersion));

  // Store repo versions
  const batchRequestsResult = await runBatchRequests(requests);
  requestLogger.debug({ batchRequestsResult });

  return;
}
