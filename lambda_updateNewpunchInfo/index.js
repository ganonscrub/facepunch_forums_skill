const aws = require('aws-sdk');
const https = require('https');
const cheerio = require('cheerio');

const facepunchHost = 'https://forum.facepunch.com';
const sensationalistHeadlinesUrl = `${facepunchHost}/f/sh/p/{pageNum}`;
const sensationalistTableName = process.env.SENSATIONALIST_TABLE_NAME;
const polidicksHeadlinesurl = `${facepunchHost}/f/pd/p/{pageNum}`;
const polidicksTableName = process.env.POLIDICKS_TABLE_NAME;

const dynamodb = new aws.DynamoDB();
const dynamodbMaxItemsPerBatch = 25;

exports.handler = async function Handler(event, context){
  try{
    let sensationalistThreads = await getThreads(sensationalistHeadlinesUrl);
    let sensationalistClearResult = await clearTable(sensationalistTableName);
    let sensationalistpopulateResult = await populateTable(sensationalistTableName, sensationalistThreads);
    
    let polidicksThreads = await getThreads(polidicksHeadlinesurl);
    let polidicksClearResult = await clearTable(polidicksTableName);
    let polidicksPopulateResult = await populateTable(polidicksTableName, polidicksThreads);
    
    console.log(`${sensationalistThreads.length} sensationalist threads and ${polidicksThreads.length} polidicks threads stored`);
    
    return true;
  }
  catch(e){
    console.error(e);
    
    return false;
  }
};

const httpsPromise = function(url){
  return new Promise((resolve, reject) =>{
    let request = https.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode > 299){
        reject(new Error(response.statusCode));
      }
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => resolve(body.join('')));
    });
    request.on('error', (err) => reject(err));
  });
};

async function getThreads(baseUrl){
  let output = [];
  
  let tasks = []; 
  for (let i = 1; i <= parseInt(process.env.MAX_PAGES_TO_RETURN, 10); i++){
    let task = httpsPromise(baseUrl.replace('{pageNum}', i));
    tasks.push(task);
  }
  let results = await Promise.all(tasks);
  
  for (let [idx, result] of results.entries()){
    let $ = cheerio.load(result);
    let threads = $('.threadblock:not(.is-sticky)').toArray();
    for (let cThread of threads){
      const thread = $(cThread);
      
      let link = thread.find('.threadmain').find('.bglink').attr('href');
      
      let title = thread.find('.threadtitle').text().trim();
      let created = new Date(thread.find('.threadage').attr('title'));
      let counts = thread.find('.postcount').attr('title');
      
      let replyCount = parseInt(counts.match(/(\d{1,}) Replies/)[1], 10);
      let viewCount = parseInt(counts.match(/(\d{1,}) Views/)[1], 10);
      let subscriberCount = parseInt(counts.match(/(\d{1,}) Subscribers/)[1], 10);
      
      let lastPostTimeSeconds = thread.find('.threadlastpost').find('div').find('timeago').attr('src');
      let lastPostTime = new Date(0);
      lastPostTime.setUTCSeconds(lastPostTimeSeconds);
      
      output.push({
        link: link,
        headline: title,
        created: created.toISOString(),
        replies: replyCount.toString(),
        views: viewCount.toString(),
        subscribers: subscriberCount.toString(),
        lastPostTime: lastPostTime.toISOString(),
      });
    }
  }
  
  return output;
}

async function clearTable(tableName){
  let existingItems = await dynamodb.scan({TableName: tableName}).promise();
  
  if (existingItems.Items.length <= 0){
    return `No items to delete, continuing...`;
  }
  
  let done = false;
  let currentBatch = 0;
  let batches = [];
  
  while (!done)
  {
    let deleteParams = { RequestItems: { } };
    deleteParams.RequestItems[tableName] = [];
    
    for (let i = currentBatch * dynamodbMaxItemsPerBatch; i < currentBatch * dynamodbMaxItemsPerBatch + dynamodbMaxItemsPerBatch; i++){
      let item = existingItems.Items[i];
      
      if (!item){
        done = true;
        break;
      } else {
        deleteParams.RequestItems[tableName].push({
          DeleteRequest: {
            Key: {
              headline: {
                S: item.headline.S
              }
            }
          }
        });
      }
    }
    
    if (deleteParams.RequestItems[tableName].length <= 0)
      break;
    
    batches.push(dynamodb.batchWriteItem(deleteParams).promise());
    
    currentBatch++;
  }
  
  let results = await Promise.all(batches);
  return results;
}

async function populateTable(tableName, threads){
  let done = false;
  let currentBatch = 0;
  let batches = [];
  
  while (!done){
    let putParams = { RequestItems: { } };
    putParams.RequestItems[tableName] = [];
      
    for (var i = currentBatch * dynamodbMaxItemsPerBatch; i < currentBatch * dynamodbMaxItemsPerBatch + dynamodbMaxItemsPerBatch; i++){
      let thread = threads[i];
      if (!thread){
        done = true;
        break;
      }
      
      putParams.RequestItems[tableName].push({
        PutRequest: {
          Item: {
            link: {
              S: thread.link
            },
            headline: {
              S: thread.headline
            },
            created: {
              S: thread.created
            },
            replies: {
              N: thread.replies
            },
            views: {
              N: thread.views
            },
            subscribers: {
              N: thread.subscribers
            },
            lastPostTime: {
              S: thread.lastPostTime
            }
          }
        }
      });
    }
    
    if (putParams.RequestItems[tableName].length <= 0)
      break;
    
    batches.push(dynamodb.batchWriteItem(putParams).promise());
    
    currentBatch++;
  }
  
  let results = await Promise.all(batches);
  return results;
}