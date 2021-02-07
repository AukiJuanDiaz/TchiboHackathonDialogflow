// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion, Payload} = require('dialogflow-fulfillment');
const {Client} = require('pg');
const {random} = require('mathjs');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements
 
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
 
  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }
 
  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }
  
  function connectToDatabase(){
  	const client = new Client({
      user: "fozphvaelbvobx",
      password: "672ed37608386c45a193b1b0e2544e595100bcfb219efce708184965cc3883db",
      database: "d3vms5fks8c6k3",
      port: 5432,
      host: "ec2-99-81-238-134.eu-west-1.compute.amazonaws.com",
      ssl: {
          rejectUnauthorized : false,
      }
	});  
    return new Promise((resolve,reject) => {
       client.connect();
       resolve(client);
    });
  }
  
  function queryDatabase(client, queryText){
    return new Promise((resolve, reject) => {
      client.query(queryText, (error, results) => {
        resolve(results);
      });
    });
  }
  
  function insertToDatabase(client, queryText, datalist){
  	return new Promise((resolve, reject) => {
    	client.query(queryText, datalist, (error, results) => {
          if (error) {
        	console.log(error.stack);
          } else {
        	resolve(results);
          }
      });
    });
  }
  
  function handleGetData(agent){
    return connectToDatabase()
    .then(client => {
      return queryDatabase(client, `SELECT * FROM complaints`)
      .then(result => {
        agent.add(`Database read for Debug`);
        console.log(result.rows);
        console.log(result.rows.length);
        // only works in Telegram (and only writes each category once)
        result.rows.map(row => {
        	agent.add(`Complaint category: ${row.category}`);
        });	
		client.end();
      });
    });
  }
  
  var complaintTextGlobal;
  
  function handleComplaint(agent){
    
    
    var uuid_list;
    connectToDatabase()
    .then(client => {
      return queryDatabase(client, `SELECT uuid FROM complaints`)
      .then(result => {
        console.log(`ACCESSING UUID LIST`);
        console.log(result.rows);
        console.log(result.rows.length);
		uuid_list = result.rows;
		client.end();
      });
    });
    
    console.log("uuid_list");
    console.log(uuid_list);

    var search_uuid = true;
    var uuid;
    while (search_uuid) {
      // Generate a random 4 digit alphanumeric string
      uuid = random().toString(36).substr(2,4).toUpperCase();
      console.log(uuid);
      
      // Check if the new code is already in the database
      if (uuid_list === undefined) {
        console.log(`The uuid_list is undefined`);
        search_uuid = false;
      } else {
        if (uuid_list.includes({'uuid': uuid})){
          console.log(`The uuid ` + uuid + ` is already in the list, so we generate a new one.`);
        } else {
          console.log(`The uuid ` + uuid + ` is not in the list, soit will be used.`);
          search_uuid = false;
        }
      }
    }
   
    // Checking if the user wants to stay anonymous
    var Anonymous = true;
    var Name = " "; 
    var identity_params;
    agent.contexts.map(context =>{ if (context.name === 'identity') {identity_params = context.parameters;}});
    if (identity_params.identity_status === 'Anonymous') {
    } else {
    	Anonymous = false;
        Name = identity_params.name;
    }
    
    // Getting location and complaint text
    var location_params;
    agent.contexts.map(context =>{ if (context.name === 'location') {location_params = context.parameters;}});
    var location = location_params.factory;
    console.log(`location.factory`);
    console.log(location);
    
    var issue_params;
    agent.contexts.map(context =>{ if (context.name === 'issue') {issue_params = context.parameters;}});
    var complaintText = issue_params.complaintText;
    console.log(`issue.complaintText`);
    console.log(complaintText);
	
    // Get the complaint category our of the agent
    var category = agent.parameters.complaint_category;
    
    // Pure generating of uuid for debug. Check is still missing.
    const uuid_debug = random().toString(36).substr(2,4).toUpperCase();
    const text = 'INSERT INTO Complaints(Category,FreeText,Anonymous,PersonName, location_name, uuid) VALUES($1, $2, $3, $4, $5, $6) RETURNING *';
    const values = [category, complaintText, Anonymous, Name, location, uuid_debug];
	
    return connectToDatabase()
    	.then(client => {
    	return insertToDatabase(client, text, values)
    		.then(result => {
          		console.log(result.rows);
        		agent.add(`Thank you for fileing your complaint. We will follow it up and keep you posted.`);
    			agent.add(`Your complaint code is ` + uuid_debug);
            	agent.add(new Payload(agent.TELEGRAM, 
                                      {"text": "You can follow your complaint by entering the code on our <a href=\"https://complaints-ui.herokuapp.com/\">website</a>",
        								"parse_mode": "html"}, 
                                      {rawPayload: false, sendAsMessage: true}));
          		client.end();
        	});
    	});
  }
  
  function handleComplaintText(agent){
    console.log(`agent.parameters.complaintText`);
    console.log(agent.parameters.complaintText);
    complaintTextGlobal = agent.parameters.complaintText;
    agent.add(`Thank you for sharing. Can you tell us the name of the factory?`);
    agent.setContext({
      "name": 'issue',
      "lifespan": 5,
      "parameters":{"complaintText": agent.parameters.complaintText}
    });
  }
  
  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('getDataFromMySQL', handleGetData);
  intentMap.set('Received_Complaint_Category', handleComplaint);
  intentMap.set('getComplaintText', handleComplaintText);

  agent.handleRequest(intentMap).then(r => console.log(r)).catch(e=>console.error(e));
});


