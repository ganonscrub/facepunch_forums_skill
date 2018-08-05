const alexa = require('ask-sdk');
const aws = require('aws-sdk');
const lambda = new aws.Lambda();

const APP_ID = process.env.APP_ID;
const SKILL_NAME = 'Facepunch Forums';
const GET_INFO_LAMBDA_NAME = 'getNewpunchInfo';
const MAX_HEADLINE_COUNT = 10;
const DEFAULT_HEADLINE_COUNT = 3;
const HELP_MESSAGE = 'You can ask me for the top three, five, or ten headlines from Sensationalist Headlines or Polidicks on the Facepunch Forums.';
const HELP_REPROMPT = 'Which would you like to hear?';
const STOP_MESSAGE = 'Goodbye!';

const ordinalStrings = [
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eight',
  'Ninth',
  'Tenth',
]

const GetSensationalistHeadlinesHandler = {
  canHandle(handlerInput){
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'LaunchRequest'
      || (request.type === 'IntentRequest'
        && request.intent.name == 'GetSensationalistHeadlines');
  },
  async handle(handlerInput){
    let slots = handlerInput.requestEnvelope.request.intent.slots;
    
    let count = DEFAULT_HEADLINE_COUNT;
    
    if (slots.count){
      if (slots.count.value){
        count = parseInt(slots.count.value, 10);
        
        if (count < DEFAULT_HEADLINE_COUNT)
          count = DEFAULT_HEADLINE_COUNT;
        else if (count === 4)
          count = 5;
        else if (count > 5)
          count = MAX_HEADLINE_COUNT;
      }
    }
    
    let threads = await getHeadlines('sensationalist', count, 'lastPostTime');
    
    let headlinesSpokenString = '';
    let headlinesCardString = '';
    for (let [idx, thread] of Object.entries(threads)){
      let ordinal = ordinalStrings[idx];
      headlinesSpokenString += ` ${ordinal} headline: ${thread.headline}.`;
      headlinesCardString += `${parseInt(idx, 10) + 1}. ${thread.headline}\n`;
    }
    
    let response = handlerInput.responseBuilder
      .speak(`Here are the latest ${threads.length} news headlines from Facepunch.${headlinesSpokenString}`)
      .withSimpleCard(SKILL_NAME, headlinesCardString)
      .getResponse();
      
    console.info(`Generate Alexa response:\n${JSON.stringify(response, null, '\t')}`);
    
    return response;
  },
};

const HelpHandler = {
  canHandle(handlerInput){
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
        && request.intent.name == 'AMAZON.HelpIntent';
  },
  handle(handlerInput){    
    return handlerInput.responseBuilder
      .speak(HELP_MESSAGE)
      .reprompt(HELP_REPROMPT)
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput){
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest'
        && (request.intent.name == 'AMAZON.CancelIntent' || request.intent.name == 'AMAZON.StopIntent');
  },
  handle(handlerInput){    
    return handlerInput.responseBuilder
      .speak(STOP_MESSAGE)
      .getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}\nStack trace: ${error.stack}`);

    return handlerInput.responseBuilder
      .speak('Sorry, an error occurred.')
      .reprompt('Sorry, an error occurred.')
      .getResponse();
  },
};

const skillBuilder = alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    GetSensationalistHeadlinesHandler,
    HelpHandler,
    ExitHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();

async function getHeadlines(type, count, sortKey){
  let lambdaRequestPayload = {
    type: type,
    count: count,
    sortKey: sortKey
  };
  
  console.info(`Sending ${JSON.stringify(lambdaRequestPayload, null, '\t')} request payload to ${GET_INFO_LAMBDA_NAME} Lambda`);
  
  let result = await lambda.invoke({
    FunctionName: GET_INFO_LAMBDA_NAME,
    Payload: JSON.stringify(lambdaRequestPayload)
  }).promise();
  
  console.info(`Response payload from ${GET_INFO_LAMBDA_NAME} Lambda:\n${JSON.stringify(result.Payload, null, '\t')}`);
  
  try {
    return JSON.parse(result.Payload);
  } 
  catch (e){
    console.error(e);
    return [];
  }
}