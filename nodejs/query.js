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

var logger = utils.getLogger('query');
var ORGS = devUtil.ORGS;
var CFGS = devUtil.CFGS;


query('excc', 'v0',['a']);
function query(ccid, ccv, argsUsed){
    var tx_id = null;
    var nonce = null;
    var the_user = null;

	var org = 'org1';
	var client = new hfc();
	var chain = client.newChain(CFGS.channelID);

	var orgName = ORGS[org].name;

	var targets = [];
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
				});
			chain.addPeer(peer);
		}
	}

	return hfc.newDefaultKeyValueStore({
		path: devUtil.storePathForOrg(orgName)
	}).then((store) => {

		client.setStateStore(store);
		return devUtil.getSubmitter(client, org);

	}).then((admin) => {
		the_user = admin;

		nonce = utils.getNonce();
		tx_id = chain.buildTransactionID(nonce, the_user);
                 console.log("chain.queryByChaincode");
		// send query
		var request = {
			chaincodeId : ccid,
			chaincodeVersion : ccv,
			chainId: CFGS.channelID,
			txId: tx_id,
			nonce: nonce,
			fcn: 'query',
			args: argsUsed
		};
             
		return chain.queryByChaincode(request);
	}).then((response_payloads) => {
		if (response_payloads) {
			for(let i = 0; i < response_payloads.length; i++) {
			    console.log('query result is ' + response_payloads[i].toString('utf8'));
			}
			
			return response_payloads[0].toString('utf8');
		} else {
			logger.error('response_payloads is null');
			throw new Error('response_payloads is null');
		}
	}).catch((err) => {
		logger.error('Failed to end to end test with error:' + err.stack ? err.stack : err);
	});
}

exports.query=query;
