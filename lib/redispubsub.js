var redis = require('redis'),
    crypto = require('crypto'),
    os = require('os'),
    EventEmitter = require('events').EventEmitter,
    util = require('util'),
    uuid = require('node-uuid'),
    nodeVersion = process.version.replace('v','').split(/\./gi).map(function (t) { return parseInt(t, 10) });

var procUuid = uuid.v4();
var hostName = os.hostname();

module.exports = RedisPubSub; 
 
function RedisPubSub (options) {
    if (!(this instanceof RedisPubSub)) {
        return new RedisPubSub(options, callback);
    }

    EventEmitter.call(this);

    var self = this, options = options || {};

    self.server         = options.address   || '127.0.0.1';
    self.port           = options.port      || 6379;
    self.channel	= options.channel   || 'NodeDiscoverChannel';
    self.key            = options.key       || null;
    self.ignoreProcess  = (options.ignoreProcess ===  false) ? false : true;
    self.ignoreInstance = (options.ignoreInstance ===  false) ? false : true;


    self.instanceUuid = uuid.v4();
    self.processUuid = procUuid;

    // connect with redis
    self.readClient = null;
    self.writeClient = null;


    self.on("error", function (err) {
        //TODO: Deal with this
        /*console.log("Network error: ", err.stack);*/
    });
};

util.inherits(RedisPubSub, EventEmitter);

RedisPubSub.prototype.start = function (callback) {
    var self = this;

    self.writeClient = redis.createClient({
        host: self.server,
        port: self.port
    });

    self.readClient = redis.createClient({
        host: self.server,
        port: self.port
    });
    self.readClient.on("message", function (channel, message) {
    });
    self.readClient.subscribe(self.channel);
    self.readClient.on("ready", function() {
            self.readClient.on("message", function ( channel, message ) {
            self.decode(message, function (err, obj) {
                if (err) {
                    //most decode errors are because we tried
                    //to decrypt a packet for which we do not
                    //have the key

                    //the only other possibility is that the
                    //message was split across packet boundaries
                    //and that is not handled

                    //self.emit("error", err);
                }
                else if (obj.pid == procUuid && self.ignoreProcess) {
                        return false;
                }
                else if (obj.iid == self.instanceUuid && self.ignoreInstance) {
                        return false;
                }
                else if (obj.event && obj.data) {
                    self.emit(obj.event, obj.data, obj);
                }
                else {
                    self.emit("message", obj)
                }
            });
        });
        return callback && callback();
    });
};

RedisPubSub.prototype.stop = function (callback) {
    var self = this;
    self.writeClient.end();
    self.readClient.end();
    self.writeClient = null;
    self.readClient = null;
    return callback && callback();
};

RedisPubSub.prototype.send = function (event) {
    var self = this;

    var obj = {
        event : event,
        pid : procUuid,
        iid : self.instanceUuid,
        hostName : hostName
    };

    if (arguments.length == 2) {
        obj.data = arguments[1];
    }
    else {
        //TODO: splice the arguments array and remove the first element
        //setting data to the result array
    }

    self.encode(obj, function (err, contents) {
        if (err) {
            return false;
        }
        self.writeClient.publish(self.channel, contents);
    });
};

RedisPubSub.prototype.encode = function (data, callback) {
    var self = this
        , tmp
        ;

    try {
        tmp = (self.key)
            ? encrypt(JSON.stringify(data),self.key)
            : JSON.stringify(data)
            ;
    }
    catch (e) {
        return callback(e, null);
    }

    return callback(null, tmp);
};

RedisPubSub.prototype.decode = function (data, callback) {
    var self = this
        , tmp
        ;

    try {
        if (self.key) {
        tmp = JSON.parse(decrypt(data.toString(),self.key));
        }
        else {
            tmp = JSON.parse(data);
        }
    }
    catch (e) {
        return callback(e, null);
    }

    return callback(null, tmp);
};

function encrypt (str, key) {
    var buf = [];
    var cipher = crypto.createCipher('aes256', key);

    buf.push(cipher.update(str, 'utf8', 'binary'));
    buf.push(cipher.final('binary'));

    return buf.join('');
};

function decrypt (str, key) {
    var buf = [];
    var decipher = crypto.createDecipher('aes256', key);

    buf.push(decipher.update(str, 'binary', 'utf8'));
    buf.push(decipher.final('utf8'));

    return buf.join('');
};
