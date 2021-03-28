const debug = require('../debug')('ping');
const protocol = require('../protocol');

module.exports = function ping(server) {
	debug('initialized');

	server.on('connection', connection => {
		debug('attaching to connection');

		const interval = +server.config('pingTime');
		let awaitingResponse = false;
		let timer;

		function schedulePing() {
			cancelPing();

			timer = setInterval(() => {
				if (awaitingResponse) die();
				else sendPing();
			}, interval);
		}

		function cancelPing() {
			if (timer) clearInterval(timer);

			timer = null;
			awaitingResponse = false;
		}

		function sendPing() {
			debug('pinging', connection.mask);

			// FICME not actually sure connection.mask is the right parameter here, either. sorry
			connection.send(true, 'PING', connection.mask);
			awaitingResponse = true;
		}

		function die() {
			debug('timed out');

			cancelPing();
			connection.close();
		}

		connection.on('PING', () => {
			debug('responding to ping');

			// FIXME uhh not sure how to actually handle these parameters... the official RFC is kinda confusing to me
			connection.send(true, 'PONG', server.host);
		});

		connection.on('PONG', () => {
			debug('received pong', connection.mask);

			schedulePing();
		});

		// schedule first ping as soon as the client is authed
		connection.on('authorized', schedulePing);

		// reschedule any time the client sends data
		connection.on('command', schedulePing);

		connection.on('user:quit', cancelPing);

		// start sending pings
		schedulePing();
	})
}