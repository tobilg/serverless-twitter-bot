import { graphql } from "@octokit/graphql"
import Logger from './logger';
import { getClient } from './db';

const {
  TABLE_NAME,
  GITHUB_ACCESS_TOKEN,
} = process.env;

// Instantiate logger
const logger = new Logger();

// Instantiate GitHub GraphQL interface
const octokitQL = graphql.defaults({
  headers: {
    authorization: `token ${GITHUB_ACCESS_TOKEN}`,
  },
});

export const repos = [
  {
    description: "AWS SDK for Javascript",
    gitHubOrganizationName: "aws",
    gitHubRepoName: "aws-sdk-js",
    gitHubDataType: "releases",
    filter: "no-prerelease"
  },
];

export async function getMostRecentRepoVersion (repoConfiguration) {
  return getClient().query({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'partitionKey = :partitionKey and begins_with(sortKey, :sortKey)',
    ExpressionAttributeValues: {
      ':partitionKey': `org#${repoConfiguration.gitHubOrganizationName}#repo#${repoConfiguration.gitHubRepoName}`,
      ':sortKey': `pa#`
    },
    Limit: 1,
    ScanIndexForward: false,
  }).promise();
}

export function createRepoVersionRequest (repoConfiguration, data) {
  return {
    PutRequest: {
      Item: {
        partitionKey: `org#${repoConfiguration.gitHubOrganizationName}#repo#${repoConfiguration.gitHubRepoName}`,
        sortKey: `pa#${data.publishedAt}`,
        versionPartitionKey: `versions`,
        versionSortKey: `pa#${data.publishedAt}`,
        ...repoConfiguration,
        ...data,
      },
    }
  };
}

export function createRepoRequest (repoConfiguration) {
  return {
    PutRequest: {
      Item: {
        partitionKey: `org#${repoConfiguration.gitHubOrganizationName}#repo#${repoConfiguration.gitHubRepoName}`,
        sortKey: `repo`,
        ...repoConfiguration,
      },
    }
  };
}

export function chunks (a, size) {
  return Array.from(
    new Array(Math.ceil(a.length / size)),
    (_, i) => a.slice(i * size, i * size + size)
  );
}

export async function runBatchRequests (requests) {
  // Basic request structure
  const params = {
    RequestItems: {}
  };

  // Store batch requests
  const batchRequests = [];
  
  // Create batch requests
  chunks(requests, 25).forEach(requestArray => {
    // Add table name and requests
    params.RequestItems[TABLE_NAME] = requestArray;
    logger.debug({ params, requestCount: requestArray.length });

    // Add batch request
    batchRequests.push(getClient().batchWrite(Object.assign({}, params)).promise());
  });
  logger.debug({ batchRequestCount: batchRequests.length, requestCount: requests.length });
  
  // Run batch requests
  return Promise.all(batchRequests);
}

export function extractSemver (str) {
  // Semver RegEx
  const semverRegEx = /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/g

  let matchName;
  if (str) {
    const found = str.match(semverRegEx);
    if (found && Array.isArray(found)) {
      matchName = found[0];
    } else {
    matchName = "Unknown";
    }
  } else {
    matchName = "Unknown";
  }
  return matchName;
}

export async function getLastRepoVersions (repoConfiguration) {
  const releasesQuery = `query {
    repository(owner: "${repoConfiguration.gitHubOrganizationName}", name: "${repoConfiguration.gitHubRepoName}") {
      releases(last: 50) {
        edges {
          node {
            tagName
            id
            name
            url
            createdAt
            publishedAt
            updatedAt
            isDraft
            isLatest
            isPrerelease
            tag {
              id
            }
            tagCommit {
              author {
                name
                avatarUrl
              }
              committedDate
              message
            }
            author {
              login
              avatarUrl
            }
          }
        }
      }
    }
  }`;

  const tagsQuery = `query {
    repository(owner: "${repoConfiguration.gitHubOrganizationName}", name: "${repoConfiguration.gitHubRepoName}") {
      refs(refPrefix: "refs/tags/", last: 50) {
        nodes {
          id
          name
          target {
            ... on Commit {
              commit_message: message
              author {
                avatarUrl
                name
                date
              }
              pushedDate
              url
            }
            commitUrl
            id
          }
        }
      }
    }
  }`;

  const results = [];

  if (repoConfiguration.gitHubDataType === "releases") { // Releases
    // Run query
    const { repository: { releases } } = await octokitQL(releasesQuery);

    results.push(...releases.edges.map(edge => {
      if (repoConfiguration.filter === "no-prerelease") {
        if (!edge.node.isDraft && !edge.node.isPrerelease) {
          return extractReleaseData(repoConfiguration, edge.node, true);
        } else {
          return null;
        }
      } else {
        return extractReleaseData(repoConfiguration, edge.node, true);
      }
    }).filter(node => node));
  } else if (repoConfiguration.gitHubDataType === "tags") { // Tags
    // Run query
    const { repository: { refs } } = await octokitQL(tagsQuery);

    results.push(...refs.nodes.map(node => extractTagData(repoConfiguration, node, true)));
  } else {
    results.length = 0;
  }

  return results;
}

export async function getRepoHistoryDataQL (repoConfiguration, { results, cursor } = { results: [] }) {
  const releasesQuery = `query($cursor:String) {
    repository(owner: "${repoConfiguration.gitHubOrganizationName}", name: "${repoConfiguration.gitHubRepoName}") {
      releases(first: 100, after:$cursor) {
        pageInfo {
          endCursor
          startCursor
          hasNextPage
        }
        edges {
          node {
            tagName
            id
            name
            url
            createdAt
            publishedAt
            updatedAt
            isDraft
            isLatest
            isPrerelease
            tag {
              id
            }
            tagCommit {
              author {
                name
                avatarUrl
              }
              committedDate
              message
            }
            author {
              login
              avatarUrl
            }
          }
        }
      }
    }
  }`;

  const tagsQuery = `query($cursor:String) {
    repository(owner: "${repoConfiguration.gitHubOrganizationName}", name: "${repoConfiguration.gitHubRepoName}") {
      refs(refPrefix: "refs/tags/", first: 100, after:$cursor) {
        pageInfo {
          endCursor
          hasNextPage
          startCursor
        }
        nodes {
          id
          name
          target {
            ... on Commit {
              commit_message: message
              author {
                avatarUrl
                name
                date
              }
              pushedDate
              url
            }
            commitUrl
            id
          }
        }
      }
    }
  }`;

  if (repoConfiguration.gitHubDataType === "releases") { // Releases
    // Run query
    const { repository: { releases } } = await octokitQL(releasesQuery, { cursor });

    results.push(...releases.edges.map(edge => {
      if (repoConfiguration.filter === "no-prerelease") {
        if (!edge.node.isDraft && !edge.node.isPrerelease) {
          return extractReleaseData(repoConfiguration, edge.node, false);
        } else {
          return null;
        }
      } else {
        return extractReleaseData(repoConfiguration, edge.node, false);
      }
    }).filter(node => node));

    // Check if there are more results, if yes iterate recursively
    if (releases.pageInfo.hasNextPage) {
      await getRepoHistoryDataQL(repoConfiguration, { results, cursor: releases.pageInfo.endCursor });
    }
  } else if (repoConfiguration.gitHubDataType === "tags") { // Tags
    // Run query
    const { repository: { refs } } = await octokitQL(tagsQuery, { cursor });

    results.push(...refs.nodes.map(node => {
      if (!node.target.author || (!node.target.pushedDate && !node.target.author.date)) {
        logger.debug({ node, message: "Ignored node due to missing properties" });
        return null;
      } else {
        extractTagData(repoConfiguration, node, false);
      }
    }).filter(node => node));

    // Check if there are more results, if yes iterate recursively
    if (refs.pageInfo.hasNextPage) {
      await getRepoHistoryDataQL(repoConfiguration, { results, cursor: refs.pageInfo.endCursor });
    }
  } else {
    results = [];
  }

  return results;
}

export function extractReleaseData (repoConfiguration, node, isRecurrentQuery = true) {
  return {
    gitHubOrganizationName: repoConfiguration.gitHubOrganizationName,
    gitHubRepoName: repoConfiguration.gitHubRepoName,
    id: node.id,
    name: node.name,
    nameSemverVersion: extractSemver(node.name),
    url: node.url,
    authorName: node.author.login,
    authorAvatarUrl: node.author.avatarUrl,
    tagId: node.tag.id,
    tagName: node.tagName,
    tagSemverVersion: extractSemver(node.tag_name),
    tagCommitAuthorName: node.tagCommit.author.name,
    tagCommitAuthorAvatarUrl: node.tagCommit.author.avatarUrl,
    tagCommitMessage: node.tagCommit.message,
    createdAt: node.createdAt,
    publishedAt: node.publishedAt,
    updatedAt: node.updatedAt,
    commitedAt: node.tagCommit.committedDate,
    isRecurrentQuery,
  }
}

export function extractTagData (repoConfiguration, node, isRecurrentQuery = true) {
  return {
    gitHubOrganizationName: repoConfiguration.gitHubOrganizationName,
    gitHubRepoName: repoConfiguration.gitHubRepoName,
    id: node.id,
    name: node.name,
    nameSemverVersion: extractSemver(node.name),
    url: node.target.url,
    authorName: node.target?.author?.name,
    authorAvatarUrl: node.target?.author?.avatarUrl,
    tagId: node.id,
    tagName: node.name, // Use as tag name
    tagSemverVersion: extractSemver(node.name),
    tagCommitAuthorName: node.target?.author?.name,
    tagCommitAuthorAvatarUrl: node.target?.author?.avatarUrl,
    tagCommitMessage: node.target?.commit_message,
    createdAt: node.target.author?.date,
    publishedAt: node.target.pushedDate || node.target.author.date,
    updatedAt: node.target?.author?.date, // No update date, use createdAt
    commitedAt: node.target?.author?.date, // reuse
    isRecurrentQuery,
  }
}
