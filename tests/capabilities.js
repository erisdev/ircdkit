var ircdkit = require('../lib/index');
var net = require('net');
var split = require('split');
var pkg = require('../package.json')

exports['client negotiates capability'] = function (test) {
	test.expect(8);
	var irc = ircdkit({
		capabilities: ["test1", "test2"],
	}).use("capabilities");

	irc.on('error', function (err) {
		test.ok(false);
		console.error(err);
	});

	irc.listen(6000, '0.0.0.0', function () {

		var port = irc._server.address().port;
		test.ok(true, 'Listening');

		irc.on('connection', function (conn) {
			test.ok(true, 'Connected in');

			conn.on('authenticated', function () {
				test.equal(conn.username, 'test1', 'username');
				test.equal(conn.realname, 'test2', 'realname');
				test.ok(conn.hasCapability("test1"), "test1 capability enabled");
				test.ok(!conn.hasCapability("test2"), "test2 capability not enabled")

				irc.close(function () {
					test.ok(true, 'Closed');
					test.done();
				});
			});
		});

		var socket = net.connect({port: port, host: '127.0.0.1'}, function () {
			test.ok(true, 'Connected out');

			socket.write('CAP LS 301\r\n');
			socket.write('USER test1 - - test2\r\n');
			socket.write('CAP REQ :test1\r\n');
			socket.write('CAP END\r\n');
		});

		socket.on('error', function (err) {
			test.ok(false);
			console.error(err);
		});
	});

};
