import Logger from './lib/logger';
import { DynamoDB } from 'aws-sdk';
import Twit from 'twit';

// Instantiate logger
const logger = new Logger();

// Get env vars
const {
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_TOKEN_SECRET,
} = process.env;

// Instantiate Twit
const T = new Twit({
  consumer_key: TWITTER_CONSUMER_KEY,
  consumer_secret: TWITTER_CONSUMER_SECRET,
  access_token: TWITTER_ACCESS_TOKEN,
  access_token_secret: TWITTER_ACCESS_TOKEN_SECRET,
});

const postTweet = (message) => {
  return new Promise((resolve, reject) => {
    T.post('statuses/update', { status: message }, function(err, data, response) {
      if (err) {
        reject(err);
      } else {
        logger.debug({ data, response });
        resolve(data);
      }
    });
  });
}

// eslint-disable-next-line import/prefer-default-export
export const handler = async (event, context) => {
  const requestLogger = logger.child({ requestId: context.awsrequestId });
  requestLogger.debug({ event, context });

  // Filter INSERT records, umarshall objects, and filter for recurrent queries (others are history loads!)
  const newRepoVersions = event.Records
    .filter((record) => record.eventName === 'INSERT')
    .map((record) => DynamoDB.Converter.unmarshall(record.dynamodb.NewImage)
  );
  requestLogger.debug({ newVersionCount: newRepoVersions.length, newRepoVersions });

  // Create tweets (only for recurrent queries)
  const tweets = newRepoVersions.filter((repoVersion) => repoVersion.isRecurrentQuery).map((repoVersion) => {
    const message = `${repoVersion.description} has a new ${repoVersion.gitHubDataType.substring(0, repoVersion.gitHubDataType.length - 1)} "${repoVersion.name}", published at ${repoVersion.publishedAt.replace('T', ' ').replace('Z', ' (UTC)')}\n\n${repoVersion.url}`;
    requestLogger.debug({ message });
    return Promise.resolve(); //postTweet(message);
  });

  try {
    const tweetsResult = await Promise.all(tweets);
    requestLogger.debug({ tweetsResult });
  } catch (err) {
    requestLogger.error({ err });
    throw err;
  }

  return;
}
