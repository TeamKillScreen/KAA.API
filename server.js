var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var azure = require('azure-storage');
var base64 = require('base64-js');
var Stream = require('stream');
var request = require("request")

var config = null;

try {
    config = require('./config');
} catch (ex) {
    config = {}
    config.BlobConnectionString = process.env.AZURE_BLOB_CONNECTION_STRING
    config.FunctionAPINewFile = process.env.FUNCTION_API_NEW_FILE
}

console.log(config)

var blobSvc = azure.createBlobService(config.BlobConnectionString);

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080;        // set our port

// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// middleware to use for all requests
router.use(function(req, res, next) {
    // do logging
    console.log('Something is happening.');
    next(); // make sure we go to the next routes and don't stop here
});

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
    res.json({ message: 'hooray! welcome to our api!' });
});

router.post('/identity', function(req, res) {

  var data = base64.toByteArray(req.body.content),
          buffer = new Buffer(data),
          stream = new Stream();
          stream['_ended'] = false;
          stream['pause'] = function() {
              stream['_paused'] = true;
          };
          stream['resume'] = function() {
              if(stream['_paused'] && !stream['_ended']) {
                  stream.emit('data', buffer);
                  stream['_ended'] = true;
                  stream.emit('end');
              }
          };

  var filename = req.body.filename.toLowerCase();

  blobSvc.createBlockBlobFromStream('identity', filename, stream, data.length, function(error, result, response){
    console.log(result)
    console.log(error)
    console.log(response)
    if(!error){
      console.log('Uploaded file')

      var requestData = { "FilePath": "identity/" + filename};

      request({
        url: config.FunctionAPINewFile,
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        json: requestData
      },function (error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log(body)
        }
        else {

            console.log("error: " + error)
            console.log("response.statusCode: " + response.statusCode)
            console.log("response.statusText: " + response.statusText)
        }
      });

      res.json({message:"Thanks"})
    } else {
      res.code = 500;
    }
  });
});

// more routes for our API will happen here
router.route('/')


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);
