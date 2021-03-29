const debug = require('../debug')('capabilities');
const { ERR_INVALIDCAPCMD } = require('../protocol').code;

const HasCapabilities = {
	hasCapability(name) {
		return this.capabilities.has(name);
	},

	hasCapabilities(names) {
		return names.every(name => this.hasCapability(name));
	},

	enableCapabilities(names) {
		for (const name of names) this.capabilities.add(name);
	},
};

function words(s) {
	return s.split(/[ ]+/g);
}

module.exports = function capabilities(server) {
	debug('initialized');

	Object.assign(server, HasCapabilities);

	server.capabilities = new Set(server.config('capabilities') || []);

	server.on('connection', connection => {
		debug('attaching to connection');

		Object.assign(connection, HasCapabilities);

		connection.capabilities = new Set();

		function listCapabilities(capabilities, subcmd, version) {
			const names = Array.from(capabilities).join(' ');

			debug('listing capabilities:', names);

			connection.send(true, 'CAP', connection.nickname || '*', subcmd, ':' + names);
		}

		function capabilitiesRequested(names) {
			debug('client requested capabilities:', names);

			const splitNames = words(names);
			let response;

			if (server.hasCapabilities(splitNames)) {
				debug('capabilities acknowledged');

				response = 'ACK';

				connection.enableCapabilities(splitNames);
			}
			else {
				debug('capabilities rejected');

				response = 'NAK';
			}

			connection.send(true, 'CAP', connection.nickname || '*', response, ':' + names);
		}

		connection.on('CAP', (subcmd, ...args) => {
			subcmd = subcmd && subcmd.toUpperCase();

			debug('CAP', subcmd, ...args);

			if (subcmd === 'LS') listCapabilities(server.capabilities, 'LS', ...args);
			else if (subcmd === 'LIST') listCapabilities(connection.capabilities, 'LIST', ...args);
			else if (subcmd === 'REQ') capabilitiesRequested(...args);
			else if (subcmd === 'END') debug('capability negotiation ended');
			else {
				connection.send(true, ERR_INVALIDCAPCMD, connection.nickname || '*', subcmd, ':Invalid CAP command');
			}
		});

		// handler pauses authentication if capability negotiation is initiated by the client
		const pauseAuthOnStart = subcmd => {
			subcmd = subcmd.toUpperCase();
			if ((subcmd === 'LS' || subcmd === 'REQ') && connection.pauseAuthentication) {
				connection.pauseAuthentication('capability negotiation');
				connection.removeListener('CAP', pauseAuthOnStart);
				connection.on('CAP', resumeAuthOnEnd);
			}
		};

		// handler resumes authentication once capability negotiation has concluded
		const resumeAuthOnEnd = subcmd => {
			if (subcmd.toUpperCase() === 'END' && connection.resumeAuthentication) {
				connection.resumeAuthentication();
				connection.removeListener('CAP', resumeAuthOnEnd);
				connection.resumeAuthentication();
			}
		};

		connection.on('authenticated', () => {
			connection.removeListener('CAP', pauseAuthOnStart);
			connection.removeListener('CAP', resumeAuthOnEnd);
		});

		connection.on('CAP', pauseAuthOnStart);
	});
}