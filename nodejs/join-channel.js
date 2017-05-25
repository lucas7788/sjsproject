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


var util = require('util');
var path = require('path');
var fs = require('fs');
var grpc = require('grpc');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var logger = utils.getLogger('join-channel');
var devUtil = require('./util.js');

var the_user = null;
var tx_id = null;
var nonce = null;

hfc.addConfigFile(path.join(__dirname, './config.json'));
var ORGS = devUtil.ORGS;
var CFGS = devUtil.CFGS;

		
var allEventhubs = [];

var _commonProto = grpc.load(path.join(__dirname, './node_modules/fabric-client/lib/protos/common/common.proto')).common;

//
//Attempt to send a request to the orderer with the sendCreateChain method
//
joinChannel('org1')
.then(() => {
	logger.info(util.format('Successfully joined peers in organization "%s" to the channel', ORGS['org1'].name));
	return joinChannel('org2');
})
.then(() => {
	logger.info(util.format('Successfully joined peers in organization "%s" to the channel', ORGS['org2'].name));
	cleanup();
})
.catch( (err) => {
	logger.error('Failed request. ' + err);
	cleanup();
});
	

function cleanup(){
    for(var key in allEventhubs) {
    	var eventhub = allEventhubs[key];
    	if (eventhub && eventhub.isconnected()) {
    		logger.info('Disconnecting the event hub');
    		eventhub.disconnect();
    	}
	}
}

function joinChannel(org) {
	logger.info(util.format('Calling peers in organization "%s" to join the channel', org));

	//
	// Create and configure the test chain
	//
	var client = new hfc();
	var chain = client.newChain(CFGS.channelID);

	var orgName = ORGS[org].name;

	var targets = [],
		eventhubs = [];

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

	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer') === 0) {
				data = fs.readFileSync(path.join(__dirname, ORGS[org][key]['tls_cacerts']));
				targets.push(
					new Peer(
						ORGS[org][key].requests,
						{
							pem: Buffer.from(data).toString(),
							'ssl-target-name-override': ORGS[org][key]['server-hostname']
						}
					)
				);

				let eh = new EventHub();
				eh.setPeerAddr(
					ORGS[org][key].events,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);
				eh.connect();
				eventhubs.push(eh);
				
				allEventhubs.push(eh);
			}
		}
	}

	return hfc.newDefaultKeyValueStore({
		path: devUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return devUtil.getSubmitter(client, org);
	})
	.then((admin) => {
		the_user = admin;

		nonce = utils.getNonce();
		tx_id = chain.buildTransactionID(nonce, the_user);
		var request = {
			targets : targets,
			txId : 	tx_id,
			nonce : nonce
		};
		
	    var eventPromises = [];
		eventhubs.forEach((eh) => {
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(reject, 10000);

				eh.registerBlockEvent((block) => {
					clearTimeout(handle);

					// in real-world situations, a peer may have more than one channels so
					// we must check that this block came from the channel we asked the peer to join
					if(block.data.data.length === 1) {
						// Config block must only contain one transaction
						var envelope = _commonProto.Envelope.decode(block.data.data[0]);
						var payload = _commonProto.Payload.decode(envelope.payload);
						var channel_header = _commonProto.ChannelHeader.decode(payload.header.channel_header);

						if (channel_header.channel_id === CFGS.channelID) {
							logger.info('The new channel has been successfully joined on peer '+ eh.ep._endpoint.addr);
							resolve();
						}
					}
				});
			});

			eventPromises.push(txPromise);
		}); // end of for

		sendPromise = chain.joinChannel(request);
		return Promise.all([sendPromise].concat(eventPromises));
	})
	.then((results) => {
		logger.info(util.format('Join Channel RESPONSE: %j', results));

		if(results[0] && results[0][0] && results[0][0].response && results[0][0].response.status == 200) {
			logger.info(util.format('Successfully joined peers in organization %s to join the channel', orgName));
		} else {
			logger.error(' Failed to join channel');
			throw new Error('Failed to join channel');
		}
	})
	.catch( (err) => {
	    logger.error('Fail due to error ' + err.stack ? err.stack : err);
	});
}

