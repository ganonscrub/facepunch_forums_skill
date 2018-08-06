const aws = require('aws-sdk');
const dynamodb = new aws.DynamoDB();

const facepunchHost = 'https://forum.facepunch.com';
const sensationalistTableName = process.env.SENSATIONALIST_TABLE_NAME;
const polidicksTableName = process.env.POLIDICKS_TABLE_NAME;
const defaultHeadlineCount = 3;

exports.handler = async function Handler(event, context){
  console.info(`Incoming event data: ${JSON.stringify(event, null, '\t')}`);
  
  let items = await getItemsFromTable(getTargetTable(event.type));
  
  applySortKeyToResults(getSortKey(event.sortKey), items);
  
  while (items.length > (event.count || defaultHeadlineCount))
    items.pop();
  
  console.info(`Returning ${JSON.stringify(items, null, '\t')}`);
  
  return items;
};

function getTargetTable(eventType){
  if (eventType){
    switch (eventType.toLowerCase()){
      case 'sensationalist':
        return sensationalistTableName;
      case 'polidicks':
        return polidicksTableName;
      default:
        return sensationalistTableName;
    }
  }
  return sensationalistTableName;
}

async function getItemsFromTable(tableName){
  let tableScan = await dynamodb.scan({TableName: tableName}).promise();
  let threads = [];
  for (let thread of tableScan.Items){
    threads.push(dynamoThreadToJson(thread));
  }
  return threads;
}

function getSortKey(eventSortKey){
  switch (eventSortKey){
    case 'created':
      return 'created';
    case 'subscribers':
      return 'subscribers';
    case 'views':
      return 'views';
    case 'replies':
      return 'replies';
    default:
      return 'lastPostTime';
  }
}

function applySortKeyToResults(sortKey, results){
  console.info(`sortKey: ${sortKey}`);
  results.sort(function (a, b){
    if (a[sortKey] < b[sortKey]) return 1;
    else if (a[sortKey] > b[sortKey]) return -1;
    else return 0;
  });
}

function dynamoThreadToJson(thread){
  return {
    lastPostTime: new Date(thread.lastPostTime.S),
    subscribers: parseInt(thread.subscribers.N, 10),
    created: new Date(thread.created.S),
    headline: thread.headline.S,
    views: parseInt(thread.views.N, 10),
    replies: parseInt(thread.replies.N, 10),
    link: facepunchHost + thread.link.S
  };
}