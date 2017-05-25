/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


var hfc = require('fabric-client');
var util = require('util');
var fs = require('fs');
var path = require('path');

var devUtil = require('./util.js');
var utils = require('fabric-client/lib/utils.js');
var Orderer = require('fabric-client/lib/Orderer.js');

var the_user = null;

var logger = utils.getLogger('create-channel');

hfc.addConfigFile(path.join(__dirname, './config.json'));
var ORGS = devUtil.ORGS;
var CFGS = devUtil.CFGS;


//
//Attempt to send a request to the orderer with the sendCreateChain method
//
console.log('\n\n***** End-to-end flow: create channel *****\n\n');

//
// Create and configure the test chain
//
var client = new hfc();
var chain = client.newChain(CFGS.channelID);

var caRootsPath = ORGS.orderer.tls_cacerts;
let data = fs.readFileSync(path.join(__dirname, caRootsPath));
let caroots = Buffer.from(data).toString();

chain.addOrderer(
	new Orderer(
		ORGS.orderer.url,
		{
			'pem': caroots,
			'ssl-target-name-override': ORGS.orderer['server-hostname']
		}
	)
);

// Acting as a client in org1 when creating the channel
var org = ORGS[CFGS.org].name;

return hfc.newDefaultKeyValueStore({
       
	path: devUtil.storePathForOrg(org)
}).then((store) => {
	client.setStateStore(store);
        logger.info("debug       debug        debug");
	return devUtil.getSubmitter(client, CFGS.org);
})
.then((admin) => {
	console.log('Successfully enrolled user ' + CFGS.username);
	the_user = admin;

	// readin the envelope to send to the orderer
	data = fs.readFileSync(CFGS.genesis);
	var request = {
		envelope : data
	};
	// send to orderer
	return chain.createChannel(request);
}, (err) => {
	console.log('Failed to enroll user. ' + err);
})
.then((response) => {
	logger.debug(' response ::%j',response);

	if (response && response.status === 'SUCCESS') {
		console.log('Successfully created the channel.');
		return sleep(1000);
	} else {
		console.log('Failed to create the channel. ');
	}
}, (err) => {
	console.log('Failed to initialize the channel: ' + err.stack ? err.stack : err);
})
.then((nothing) => {
	console.log('Successfully waited a while, just want to make sure new channel was created.');
}, (err) => {
	console.log('Failed to sleep due to error: ' + err.stack ? err.stack : err);
});


function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
