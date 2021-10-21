import Logger from './lib/logger';
import { getMostRecentRepoVersion, getLastRepoVersions, createRepoVersionRequest, getRepoHistoryDataQL, runBatchRequests } from './lib/repos';

// Instantiate logger
const logger = new Logger();

// eslint-disable-next-line import/prefer-default-export
export const handler = async (event, context) => {
  const requestLogger = logger.child({ requestId: context.awsrequestId });
  requestLogger.debug({ event, context });

  const eventPromises = event.Records.map(rawEvent => {
    const repoConfiguration = JSON.parse(rawEvent.Sns.Message);
    return new Promise(async (resolve, reject) => {
      try {
        requestLogger.debug({ repoConfiguration });

        // Get most recent version info
        const mostRecentRepoVersion = await getMostRecentRepoVersion(repoConfiguration);
        requestLogger.debug({ mostRecentRepoVersion });

        // Check if there are existing versions
        if (mostRecentRepoVersion.Items.length >= 1) {
          // Get most recent timestamp
          const mostRecentTimestamp = mostRecentRepoVersion.Items[0].publishedAt;

          // Retrieve last 50 versions
          const mostRecentVersions = await getLastRepoVersions(repoConfiguration);
          requestLogger.debug({ mostRecentVersions });

          // New version (compared by publishedAt timestamp)
          const newVersions = mostRecentVersions.filter(mostRecentVersion => mostRecentVersion.publishedAt > mostRecentTimestamp);
          requestLogger.debug({ newVersions });

          // Check if new versions are found
          if (newVersions.length > 0) {
            // Create batch requests to store the new versions
            const requests = newVersions.map(repoVersion => createRepoVersionRequest(repoConfiguration, repoVersion));
            requestLogger.debug({ requests });

            // Run batch requests
            const batchRequestsResult = await runBatchRequests(requests);
            requestLogger.debug({ batchRequestsResult });
          }
        } else { // Otherwise fill history
          requestLogger.debug('Backfilling history version data');

          // Get all repo versions based on the repo configuration
          //const repoVersions = await getRepoHistoryDataQL(repoConfiguration);
          //requestLogger.debug({ repoVersionsCount: repoVersions.length });

          // Create repo version requests
          //const historyRequests = repoVersions.map(repoVersion => createRepoVersionRequest(repoConfiguration, repoVersion));

          // Store repo versions
          //const batchHistoryRequestsResult = await runBatchRequests(historyRequests);
          //requestLogger.debug({ batchHistoryRequestsResult });
        }

        // Resolve promise
        resolve();
      } catch (err) {
        requestLogger.error(err);
        reject(err);
      }
    })
  });

  try {
    const eventResponse = await Promise.all(eventPromises);
    requestLogger.debug({ eventResponse });
  } catch (err) {
    requestLogger.error(err);
  }

  return;
}
