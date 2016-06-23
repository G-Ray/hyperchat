#!/usr/bin/env node

var hypercore = require('hypercore')
var level = require('level-party')
var path = require('path')
var swarm = require('discovery-swarm')
var defaults = require('datland-swarm-defaults')
var home = require('os-homedir')
var minimist = require('minimist')
var events = require('events');
var protocol = require('hypercore-protocol')
protocol = protocol.use('sendKeys')

// All the keys
var keys = []

var cnt = 0

var argv = minimist(process.argv.slice(2))

if (argv.help) {
  console.error('Usage: hyperchat [options]')
  console.error()
  console.error('  --feed=[feed-key]        Feed of one participant')
  console.error()
  process.exit(1)
}

var db = level(path.join(home(), '.hyperchat.db'))
var core = hypercore(db)

var myFeed = core.createFeed()

console.log('my key is ' + myFeed.key.toString('hex'))
console.log('my discovery key is ' + myFeed.discoveryKey.toString('hex'))

// Share our feed
join(myFeed)

// Join another feed to chat with another peer
if (argv.feed) {
  var feed = core.createFeed(argv.feed)
  join(feed);
  readFeed(feed);
}

// Share a feed
function join(feed) {
  console.log('joining ' + feed.key.toString('hex'))
  keys.push(feed.key.toString('hex'))

  var sw = swarm(defaults({
    hash: false,
    stream: function() {
      return feed.replicate({stream: createStream(feed)})
    }
  }))

  sw.join(feed.discoveryKey)
  sw.on('connection', function (peer) {
    console.log('(peer joined)')
    peer.on('close', function () {
      console.log('(peer left)')
      var index = keys.indexOf(feed.key.toString('hex'))
      keys.slice(index, 1) // remove a key
      //console.log(keys.length + ' keys');
    })
  })
}

function createStream(feed) {
  var p = protocol()

  p.on('handshake', function () {
    console.log('handshake!')

    var channel = p.open(feed.key)

    // TODO: need to encrypt messages
    channel.on('sendKeys', function (receivedKeys) {
      var receivedKeys = JSON.parse(receivedKeys)
      //console.log(receivedKeys)
      for (key of receivedKeys) {
        if (keys.indexOf(key) != -1) continue // Key is already registered

        var feed = core.createFeed(key)
        // Share and read the feed
        join(feed);
        readFeed(feed);
      }
    })

    channel.sendKeys((JSON.stringify(keys)))
  })

  return p
}

// Tail a feed
function readFeed(feed) {
  feed.get(0, function (err) {
    if (err) throw err

    var end = feed.blocks

    var stream = tail()

    function tail () {
      var stream = feed.createReadStream({live: true, start: 0})
        .on('data', function (data) {
          console.log('> ' + data.toString())
        })
      return stream
    }
  })
}

// Append our messages to our feed
process.stdin.on('data', function(data) {
  var message = data.toString().trim()
  myFeed.append(message)
});
