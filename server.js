/**
 * Created by julianmonono on 29/10/2016.
 */
// server.js

// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var busboy = require('connect-busboy');
var azure = require('azure-storage');
var base64 = require('base64-js');
var Stream = require('stream');

var config = null;

try {
    config = require('./config');
} catch (ex) {
    console.log(ex);
    config = {}
    config.BlobConnectionString = process.env.AZURE_BLOB_CONNECTION_STRING
}

console.log(config)

var blobSvc = azure.createBlobService(config.BlobConnectionString);

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(busboy());

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

  blobSvc.createBlockBlobFromStream('identity', req.body.filename, stream, data.length, function(error, result, response){
    console.log(result)
    console.log(error)
    console.log(response)
    if(!error){
      console.log('Uploaded file')
    }
  });

  console.dir(req.body)
  res.json({message:"Thanks"})
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
