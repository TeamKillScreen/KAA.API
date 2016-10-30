var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var azure = require('azure-storage');
var base64 = require('base64-js');
var Stream = require('stream');
var request = require("request")
var neo4j = require('neo4j-driver').v1;
var driver = neo4j.driver("bolt://52.169.73.89", neo4j.auth.basic("neo4j", "neo4jneo4j"));
var session = driver.session();

var config = null;

try {
    config = require('./config');
} catch (ex) {
    config = {}
    config.BlobConnectionString = process.env.AZURE_BLOB_CONNECTION_STRING
    config.FunctionAPINewFile = process.env.FUNCTION_API_NEW_FILE
  config.FunctionAPINewMissingPerson = process.env.FUNCTION_API_NEW_MISSING_PERSON
}

console.log(config)

var blobSvc = azure.createBlobService(config.BlobConnectionString);

// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(bodyParser.json({limit: '50mb'}));

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

router.post('/identify', function(req, res) {

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

      var filePath = "identity/" + filename
      session
        .run("MERGE (p:Photo {FilePath : {FilePath}} ) RETURN p ", { FilePath : filePath})
        .then(function(result){
          result.records.forEach(function(record) {
            console.log(record._fields);
          });
          // Completed!
          session.close();
        })
        .catch(function(error) {
          console.log(error);
        });

      var requestData = { "FilePath": filePath};

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
          res.json({body})
        }
        else {

            console.log("error: " + error)
            console.log("response.statusCode: " + response.statusCode)
            console.log("response.statusText: " + response.statusText)
        }
      });


    } else {
      res.code = 500;
    }
  });
});



router.post('/addmugshot', function(req, res) {

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
  var personId = req.body.personId;

  blobSvc.createBlockBlobFromStream('missingpersons', filename, stream, data.length, function(error, result, response){
    console.log(result)
    console.log(error)
    console.log(response)
    if(!error){
      console.log('Uploaded file')

      var filePath = "missingpersons/" + filename
      session
        .run("MERGE (p:Photo {FilePath : {FilePath}} ) RETURN p ", { FilePath : filePath})
        .then(function(result){
          result.records.forEach(function(record) {
            console.log(record._fields);
          });
          // Completed!
          session.close();
        })
        .catch(function(error) {
          console.log(error);
        });

      var requestData = {
        "FilePath": filePath,
        "personId" : personId
      };

      request({
        url: config.FunctionAPINewMissingPerson,
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        json: requestData
      },function (error, response, body) {
        if (!error && response.statusCode === 200) {
          console.log(body)
          res.json({body})
        }
        else {

          console.log("error: " + error)
          res.code = 500;
          res.send(error)
        }
      });


    } else {
      res.code = 500;
      res.send(error)
    }
  });
});


router.put('/relatemugshot', function(req, res) {
  var filepath = req.body.filePath;
  var personId = req.body.personId;
  var persistantface = req.body.persistedFaceId;

  if (!filepath || !personId || !persistantface) {
    console.log("One of our paramiters is missing!")
  }
  session
    .run("MERGE (ms:Mugshot {persistantface : {persistantface}} )", { persistantface : persistantface})
    .then(function(result){
      result.records.forEach(function(record) {
        console.log(record._fields);
      });
      session
        .run("MATCH (ms:Mugshot {persistantface : {persistantfacep}} ), (mp:MissingPerson { Unique_ID : {personId} }), (p:Photo {FilePath : {filepath}} )  CREATE (ms)-[:MUGSHOTOF]->(mp), (p)-[:PHOTOOF]->(ms)  RETURN ms", { persistantfacep : persistantface, personId : personId, filepath : filepath})
        .then(function(result){
          result.records.forEach(function(record) {
            console.log(record._fields);
          });
          session.close();
          res.json({"OMG" : "It worked!"})
        })
        .catch(function(error) {
          console.log(error);
          res.code = 500;
          res.send(error)
        });
    })
    .catch(function(error) {
      console.log(error);
      res.code = 500;
      res.send(error)
    });
})



router.put('/relatefacetomugshot', function(req, res) {
  var persistantface = req.body.persistedFaceId;
  var filepath = req.body.filePath;
  var convidence = req.body.confidence;
  var faceId = req.body.faceId;
  var faceRectangle = req.body.faceRectangle;


  session
    .run("MATCH (ms:Mugshot {persistantface : {Persistantface}} ), (p:Photo {FilePath : {Filepath}} )  create (f:Face {faceId : {FaceId}, faceRectangletop : {FaceRectangletop}, faceRectangleleft : {FaceRectangleleft}, faceRectanglewidth : {FaceRectanglewidth}, faceRectangleheight : {FaceRectangleheight} })-[:ISIN]->(p), (fm:FaceMatch {convidence: {Convidence}})-[:CONFIDENCEOFBEING]->(ms), (fm)-[:OF]->(f)",
      { FaceId : faceId,
        FaceRectangletop : faceRectangle.top,
        FaceRectangleleft : faceRectangle.left,
        FaceRectanglewidth : faceRectangle.width,
        FaceRectangleheight : faceRectangle.height,
        Convidence : convidence,
        Persistantface : persistantface,
        Filepath :  filepath})
    .then(function(result){
      result.records.forEach(function(record) {
        console.log(record._fields);
      });
      session.close();
      res.json({"OMG" : "It worked!"})
    })
    .catch(function(error) {
      console.log(error);
      res.code = 500;
      res.json({"oh" : "FFS!"})
    });
})

// more routes for our API will happen here
router.route('/')


// REGISTER OUR ROUTES -------------------------------
// all of our routes will be prefixed with /api
app.use('/api', router);

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);
