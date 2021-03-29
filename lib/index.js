
var net = require('net'),
	tls = require('tls'),
	pkg = require('../package.json'),
	Emitter = require('events').EventEmitter,
	connection = require('./connection'),
	debug = require('./debug')(),
	extend = require('util')._extend;

const builtins = {
	authentication: require("./extensions/authentication"),
	capabilities: require("./extensions/capabilities"),
	nickname: require("./extensions/nickname"),
	ping: require("./extensions/ping"),
};

const defaultExtensions = [ "authentication", "nickname" ];

function create (options) {
	var config = extend({
		name: pkg.name,
		version: pkg.version,
		created: new Date(),
		hostname: 'unknown.tld',
		welcomeMessage: 'Welcome to IRC',
		requireNickname: false,
		authTimeout: 5000,
		pingTime: 60000,
		useDefaultExtensions: true,
	}, options);

	const extensions = new Set();
	var connections = [];

	function removeClient(client) {
		var i = connections.indexOf(client);
		if (i === -1) return;

		debug('removed client', client.id);
		return connections.splice(i, 1);
	}

	var app = new Emitter();
	var server;

	app.__defineGetter__('host', function() {
		return ':' + config.hostname;
	});

	app.handle = function (socket) {
		debug('connected', socket.remoteAddress);

		var client = connection(config, app, socket);

		connections.push(client);

		client.on('end', function () {
			debug('connection ended');
			client.close();
			app.emit('connection:end', client);
		});

		client.on('close', function () {
			debug('connection closed');
			removeClient(client);
			app.emit('connection:close', client);
		});

		client.on('error', function (err) {
			app.emit('error', err, client);
		});

		app.emit('connection', client);
	};

	app._connections = connections;

	app.getConnection = function (key, value) {
		var i = connections.length;

		if (arguments.length === 1) {
			value = key;
			key = 'id';
		}

		while (--i > -1) {
			if (connections[i][key] === value ) return connections[i];
		}
		return false;
	};

	app.createConnection = function (nickname) {
		if (!nickname) throw new Error('You must define a nickname for local connections.');

		var client = connection();
		client.nickname = nickname;

		connections.push(client);

		return client;
	};

	app.removeConnection = removeClient;

	app.listen = function listen () {
		if (server) throw new Error('A server is already running.');

		if (config.secure) {
			server = tls.createServer(config.secure, app.handle);
		} else {
			server = net.createServer(app.handle);
		}

		server.on('error', function (err) {
			debug.error('server error', err);
			app.emit('error', err);
		});

		app._server = server;

		server.once('listening', function () {
			var addr = server.address();
			debug('server listening on ' + addr.address + ':' + addr.port);
			app.emit('listening', addr.port, addr.address);
		});

		debug('starting server');
		server.listen.apply(server, arguments);

		return app;
	};

	app.config = function (key, value) {
		if (arguments.length === 1) {
			return config[key];
		}

		config[key] = value;
		return app;
	};

	app.use = function (extension) {
		if (typeof extension === 'string' && extension in builtins) {
			extension = builtins[extension];
		}

		if (typeof extension === 'function' && !extensions.has(extension)) {
			extension(app);
			extensions.add(extension);
		}

		return app;
	};

	app.close = function (fn) {
		if (fn) app.once('close', fn);

		function finishIfDrained() {
			if (connections.length) return;
			app.emit('close');
			debug('closed');
			app._server = server = null;
		}

		debug('closing all');

		if (server) server.close(finishIfDrained);
		else {
			connections = [];
			finishIfDrained();
			return;
		}

		for (const conn of connections) {
			conn.close(finishIfDrained);
		}
	};

	if (config.useDefaultExtensions) {
		defaultExtensions.forEach(name => app.use(name));
	}

	return app;
}

module.exports = create;
module.exports

