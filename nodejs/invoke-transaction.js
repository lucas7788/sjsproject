/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';


var path = require('path');
var fs = require('fs');
var util = require('util');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var devUtil = require('./util.js');

var logger = utils.getLogger('invoke-transaction');

var ORGS = devUtil.ORGS;
var CFGS = devUtil.CFGS;



function cleanup(evh){
    for(var key in evh) {
		var eventhub = evh[key];
		
		if (eventhub && eventhub.isconnected()) {
			logger.info('Disconnecting the event hub');
			eventhub.disconnect();
		}
	}
}


function invokeTxn(ccid, ccv, argsUsed){
    var invokeResult=null;
    var tx_id = null;
    var nonce = null;
    var the_user = null;
    var allEventhubs = [];

	var org = CFGS.org;
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

	var orgName = ORGS[org].name;

	var targets = [],
		eventhubs = [];
	// set up the chain to use each org's 'peer1' for
	// both requests and events
	for (let key in ORGS) {
		if (ORGS.hasOwnProperty(key) && typeof ORGS[key].peer1 !== 'undefined') {
			let data = fs.readFileSync(path.join(__dirname, ORGS[key].peer1['tls_cacerts']));
			let peer = new Peer(
				ORGS[key].peer1.requests,
				{
					pem: Buffer.from(data).toString(),
					'ssl-target-name-override': ORGS[key].peer1['server-hostname']
				}
			);
			chain.addPeer(peer);

			let eh = new EventHub();
			eh.setPeerAddr(
				ORGS[key].peer1.events,
				{
					pem: Buffer.from(data).toString(),
					'ssl-target-name-override': ORGS[key].peer1['server-hostname']
				}
			);
			eh.connect();
			eventhubs.push(eh);
			allEventhubs.push(eh);
		}
	}

	return hfc.newDefaultKeyValueStore({
		path: devUtil.storePathForOrg(orgName)
	}).then((store) => {

		client.setStateStore(store);
		return devUtil.getSubmitter(client, org);

	}).then((admin) => {

		logger.info('Successfully enrolled user \'admin\'');
		the_user = admin;

		nonce = utils.getNonce();
		tx_id = chain.buildTransactionID(nonce, the_user);
		utils.setConfigSetting('E2E_TX_ID', tx_id);
		logger.info('setConfigSetting("E2E_TX_ID") = %s', tx_id);
		logger.info(util.format('Sending transaction "%s"', tx_id));

		// send proposal to endorser
		var request = {
			chaincodeId : ccid,
			chaincodeVersion : ccv,
//         		fcn: 'initMarble',
//                      fcn:'queryMarblesByOwner',
                  //      fcn:'queryMarbles',
//                     fcn:'queryUserByUserId',
                       // fcn:'queryUsers',
                        fcn:'invoke',
             //           fcn:'AddUser',
                       // fcn:'delete',
//	        	fcn:'transferUserByUserId',
                        args: argsUsed,
			chainId: CFGS.channelID,
			txId: tx_id,
			nonce: nonce
		};
console.log(request);
		return chain.sendTransactionProposal(request);

	}).then((results) => {
		var proposalResponses = results[0];

		var proposal = results[1];
		var header   = results[2];
//这里可以获得我们需要的值
console.log('这里可以获得我们需要的值');
console.log('getCreator result is ');
console.log(proposalResponses[0].response.payload.toString("utf-8"));
		var all_good = true;
		for(var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
				one_good = true;
				logger.info('transaction proposal was good');
			} else {
				logger.error('transaction proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
                     //此时获得用户余额
                    invokeResult=proposalResponses[0].response.payload.toString('utf8');
			logger.info(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal,
				header: header
			};

			// set the transaction listener and set a timeout of 30sec
			// if the transaction did not get committed within the timeout period,
			// fail the test
			var deployId = tx_id.toString();

			var eventPromises = [];
			eventhubs.forEach((eh) => {
				let txPromise = new Promise((resolve, reject) => {
					let handle = setTimeout(reject, 30000);

					eh.registerTxEvent(deployId.toString(), (tx, code) => {
						clearTimeout(handle);
						eh.unregisterTxEvent(deployId);

						if (code !== 'VALID') {
							logger.error('The balance transfer transaction was invalid, code = ' + code);
							reject();
						} else {
							logger.info('The balance transfer transaction has been committed on peer '+ eh.ep._endpoint.addr);
							resolve();
						}
					});
				});

				eventPromises.push(txPromise);
			});

			var sendPromise = chain.sendTransaction(request);
			return Promise.all([sendPromise].concat(eventPromises))
			.then((results) => {
                                console.log(results);
                                console.log(results[0]);
				logger.debug(' event promise all complete and testing complete');
				return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call

			}).catch((err) => {

				logger.error('Failed to send transaction and get notifications within the timeout period.');
				throw new Error('Failed to send transaction and get notifications within the timeout period.');

			});

		} else {
			logger.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
			throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}, (err) => {

		logger.error('Failed to send proposal due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send proposal due to error: ' + err.stack ? err.stack : err);

	}).then((response) => {

        cleanup(allEventhubs);
        console.log(response);


		if (response.status === 'SUCCESS') {
			logger.info('Successfully sent transaction to the orderer.');
			logger.info('******************************************************************');
			logger.info('To manually run query.js, set the following environment variables:');
			logger.info('E2E_TX_ID='+'\''+tx_id+'\'');
			logger.info('******************************************************************');

 
	} else {
			logger.error('Failed to order the transaction. Error code: ' + response.status);
			throw new Error('Failed to order the transaction. Error code: ' + response.status);
		}
	}, (err) => {
        cleanup(allEventhubs);
        
		logger.error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
		throw new Error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
	});
}


exports.invokeTxn = invokeTxn;
invokeTxn('excc3','v0',['getCreator','a','b','10']);
// test invoke
//initMarblesi
//invokeTxn('marbles01','v0',['asdf','blue','35','bob']);
//invokeTxn('usertable', 'v0', ['sss2','lucas2', 'shanghai2', 'nan','admin']);
//invokeTxn('usertable','v0',['sss2','','','girl']);
//invokeTxn('usertable','v0',['sss2']);
//invokeTxn('usertable','v0',["{\"selector\":{\"usertype\":\"admin\"}}"]);
//invokeTxn('marbles02', 'v0', ["{\"selector\":{\"docType\":\"user\"}}"]);
//queryMarblesByOwner
//invokeTxn('marbles01','v0',['bob']);
//invokeTxn('marbles01','v0',['{\"selector\":{\"docType\":\"marble\"}}']);
//userTable
//invokeTxn('marbles02','v0',['{\"selector\":{\"docType\":\"marble\"}}']);
