var https = require('https')
    , http  = require('http')
    , path  = require('path')
    , fs    = require('fs')
    , net   = require('net')
    , sys   = require('sys')
    , clrs  = require('colors')
    , crypto=require('crypto');

var spdy = require('spdy');
var cachedHost= new Array();
var request = require("request");
//request = request.defaults({'proxy':'http://localhost:8888'});

var pem =require("./pem");
var config = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
var proxySiteUrl =config.proxyServerAddr;
var ca_vendor = 'NoWall';

var cipher = ['ECDHE-ECDSA-AES256-SHA',
    'ECDHE-RSA-AES256-SHA',
    'DHE-RSA-CAMELLIA256-SHA',
    'DHE-DSS-CAMELLIA256-SHA',
    'DHE-RSA-AES256-SHA',
    'DHE-DSS-AES256-SHA',
    'ECDH-RSA-AES256-SHA',
    'ECDH-ECDSA-AES256-SHA',
    'CAMELLIA256-SHA',
    'AES256-SHA',
    'ECDHE-ECDSA-RC4-SHA',
    'ECDHE-ECDSA-AES128-SHA',
    'ECDHE-RSA-RC4-SHA',
    'ECDHE-RSA-AES128-SHA',
    'DHE-RSA-CAMELLIA128-SHA',
    'DHE-DSS-CAMELLIA128-SHA',
    'DHE-RSA-AES128-SHA',
    'DHE-DSS-AES128-SHA',
    'ECDH-RSA-RC4-SHA',
    'ECDH-RSA-AES128-SHA',
    'ECDH-ECDSA-RC4-SHA',
    'ECDH-ECDSA-AES128-SHA',
    'SEED-SHA',
    'CAMELLIA128-SHA',
    'RC4-SHA',
    'RC4-MD5',
    'AES128-SHA',
    'ECDHE-ECDSA-DES-CBC3-SHA',
    'ECDHE-RSA-DES-CBC3-SHA',
    'EDH-RSA-DES-CBC3-SHA',
    'EDH-DSS-DES-CBC3-SHA',
    'ECDH-RSA-DES-CBC3-SHA',
    'ECDH-ECDSA-DES-CBC3-SHA',
    'DES-CBC3-SHA',
    'TLS_EMPTY_RENEGOTIATION_INFO_SCSV'].join(":");

var SecKey="nowall*asd123-123";//加密的秘钥

var cryptFunc = function(text){
       var cipher=  crypto.createCipher('aes-256-cbc',SecKey);
    var crypted =cipher.update(text,'utf8','hex');
     crypted+=cipher.final('hex');
	  console.log(crypted);
	 return crypted;
};

var process_options = function(proxy_options) {
    var options = proxy_options || {}

    if(!options.proxy_port)            options.proxy_port       = config.httpProxyPort;
    if(!options.mitm_port)             options.mitm_port        = config.internalUseMitmPort;
    if(!options.verbose)     options.verbose          = true;
    if(!options.proxy_write === true)  options.proxy_write      = false;
    if(!options.proxy_write_path)      options.proxy_write_path = '/tmp/proxy';
    if(!options.key_path)              options.key_path         = path.join(__dirname, 'certs', 'agent2-key.pem')
    if(!options.cert_path)             options.cert_path        = path.join(__dirname, 'certs', 'agent2-cert.pem')
    return options;
}


var handle_request = function( that,req, res,type) {

    var fetchUrl = req.url;
    if(type === "https"){
        fetchUrl = "https://" + req.headers.host + req.url;
    }
	
	if(fetchUrl.length < 5 || fetchUrl.substr(0,4) != "http"){
	    fetchUrl = "http://" + req.headers.host + req.url;
	}
	
	var startTime = new Date();
    req.headers.fetchurl=cryptFunc(fetchUrl);
    req.headers.originalhost = cryptFunc(req.headers.host);
   // req.headers.host = "ec2-54-64-212-132.ap-northeast-1.compute.amazonaws.com:9081";
	
    var reqOptions = {followRedirect:false};

    if(proxySiteUrl.toLowerCase().substr(0,5) === "https"){
        reqOptions = {
            followRedirect:false,
            rejectUnauthorized: false,
            requestCert: true,
            timeout:8,
            spdy: {
                plain: false,
                ssl: false,
                version: 3 // Force SPDY version
            }
        };
    }
    
    var proxtReq = request(proxySiteUrl,reqOptions);
	proxtReq.on("response",function(proxRes){
	   var endTime = new Date();
	   tipMsg(proxtReq.method.yellow + " " + fetchUrl + " " +  (endTime.getTime()-startTime.getTime() + "ms").green + " " + (proxRes.statusCode >= 400 ? (proxRes.statusCode + "").red : (proxRes.statusCode + "").green));
	});
	
	proxtReq.on("error",function(err){
	tipMsg(err);
	});
    req.pipe(proxtReq);
    proxtReq.pipe(res);
}

var createCertFile = function(host,callback){
    var commonName = host;

    if(host[0] == "."){
        commonName = "*" + host;
    }

    var crtOptions = {
        days:2000,
        commonName:commonName,

        selfSigned:true,
        country:"CN",
        state:"Internet",
        locality:"Cernet",
        organization:ca_vendor,
        organizationUnit:ca_vendor + " Root",
        serviceCertificate:fs.readFileSync('./ca.crt', 'utf8'),
        serviceKey:fs.readFileSync('./ca.key', 'utf8'),
        serial:Date.now()
    };

    pem.createCertificate(crtOptions,function(err,certInfo){
    
        if(err){
            errorMsg(err);
            callback(err);
        }
        else{
            var content = certInfo.certificate + "\r\n" + certInfo.clientKey;
			
            var crtPath = "./certs/"+ host +".crt";
            fs.writeFileSync(crtPath,content);
            callback(null,crtPath);
        }
    });
};

var _getCommonName = function(host){
    var convertedHostName = host;
    //模仿goagent
    var hostSplit = host.split(".");
    if(hostSplit && hostSplit.length >= 3 && hostSplit[hostSplit.length-2].length > 4){
        convertedHostName = "." +convertedHostName.substr(convertedHostName.indexOf(".") + 1);
    }

    return convertedHostName;
};

var debugMsg = function(msg){
    if(config.Debug){
        console.log(msg);
    }
}

var tipMsg = function(msg){
    if(true){
        console.log(msg);
    }
}


var errorMsg = function(msg){
    if(true){
        console.log(msg);
    }
}

var verifyCert = function(host,callback){
    debugMsg("Search host cert file:" + host);

    var convertedHostName = _getCommonName(host);
    var certPath =  './certs/' + convertedHostName + ".crt";

    if(fs.existsSync(certPath)){
        debugMsg("Found cert file for :" + host);
        callback(null,certPath);
    }
    else{
        debugMsg("Try to create a new cert file for :" + host + ", since not found:" + certPath);
          createCertFile(convertedHostName,function(err,newCertPath){
            if(err){
                errorMsg("cert file create failed.".red);
            }
            else{
                debugMsg("cert file create completely."  .green + "  " + newCertPath);
                callback(null,newCertPath);
            }
        });
    }
};

var getCertHost = function(host){
  return host.split(":")[0];
}

var startHttpListener = function(options,that){
    var server = http.createServer(function(request, response) {
        handle_request(that, request, response, "http");
    });

    // Handle connect request (for https)
    server.addListener('connect', function(req, socket, upgradeHead) {
        verifyCert(getCertHost(req.headers.host),function(err,certPath){
            if(!err){
                cachedHost[_getCommonName(getCertHost(req.headers.host))] = certPath;
                var proxy = net.createConnection(that.options.mitm_port, 'localhost');

                socket.write( "HTTP/1.0 200 Connection established\r\n\r\n");
                // socket.write("HTTP/1.1 200 Connection established\r\nConnection: close\r\n\r\n");

                // connect pipes
                socket.pipe(proxy).pipe(socket);
            }
        });

    });

    server.addListener('error', function() {
        sys.log("error on server?")
    })

    server.listen(options.proxy_port);
      if(options.verbose)
          console.log('http proxy server '.blue + 'started '.green.bold + 'on port '.blue + (""+options.proxy_port).yellow);

    startMtim(options,that);
    return server;
}

 var startMtim= function(options,that){

     var https_opts = {
         rejectUnauthorized: false,
         key: fs.readFileSync('./ca.key', 'utf8'),
         cert: fs.readFileSync('./ca.crt', 'utf8'),
         ca: fs.readFileSync('./ca.crt', 'utf8'),
         SNICallback: function (hostname) {

             var sslHost = getCertHost(hostname);
             var certFile = cachedHost[_getCommonName(sslHost)];

             if(certFile){
                 debugMsg("Added cert file for : " + sslHost);

                 var context = crypto.createCredentials({
                     key:  fs.readFileSync(certFile),
                     cert: fs.readFileSync(certFile),
                     ca: [fs.readFileSync('./ca.crt')]}).context;

                 context.setCiphers(cipher);
                 return context;
             }
             else{
                 errorMsg(("Cert file wrong : " + sslHost).red);
                 return null;
             }
         }
     };

     var mitm_server = https.createServer(https_opts, function (request, response) {
         handle_request(that, request, response, "https");
     });

     mitm_server.addListener('error', function() {
         errorMsg("error on server?")
     })

     mitm_server.listen(options.mitm_port);

     if(options.verbose){
         console.log('https man-in-the-middle proxy server'.blue + ' started '.green.bold + 'on port '.blue + (""+options.mitm_port).yellow);
     }

     return mitm_server;
 }

module.exports = function(proxy_options, processor_class) {
    this.options = process_options(proxy_options);

	if(!fs.existsSync("./certs")){
	    fs.mkdirSync("./certs");
	}
    var that = this;
    startHttpListener(this.options,that);
  }

//处理各种错误
process.on('uncaughtException', function(err)
{
    console.log("\nError!!!!");
    console.log(err);
});
