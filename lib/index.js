var express        = require('express')
var fs             = require('fs')
var Error          = require('http-errors')
var compression    = require('compression')
var Auth           = require('./auth')
var Logger         = require('./logger')
var Config         = require('./config')
var Middleware     = require('./middleware')
var Cats           = require('./status-cats')
var Storage        = require('./storage')
var loadHandlebars = require('./handlebars')

module.exports = function(config_hash) {
  Logger.setup(config_hash.logs)

  var config  = Config(config_hash)
  var storage = Storage(config)
  var auth    = Auth(config)
  var app     = express()

  var Handlebars = loadHandlebars(config)

  var errorTemplate = Handlebars.compile(fs.readFileSync(require.resolve('./GUI/error.hbs'), 'utf8'))

  // run in production mode by default, just in case
  // it shouldn't make any difference anyway
  app.set('env', process.env.NODE_ENV || 'production')

  function error_reporting_middleware(req, res, next) {
    res.report_error = res.report_error || function(err) {
      if (err.status && err.status >= 400 && err.status < 600) {
        if (!res.headersSent) {
          res.status(err.status)
          var message = err.message || 'unknown error'
          if (req.accepts(['html', 'json']) === 'html') {
            res.setHeader('Content-Type', 'text/html')
            next(errorTemplate({status: err.status, message: message}))
          } else {
            next({ error: message })
          }
        }
      } else {
        Logger.logger.error( { err: err }
                           , 'unexpected error: @{!err.message}\n@{err.stack}')
        if (!res.status || !res.send) {
          Logger.logger.error('this is an error in express.js, please report this')
          res.destroy()
        } else if (!res.headersSent) {
          res.status(500)
          if (req.accepts(['html', 'json']) === 'html') {
            res.setHeader('Content-Type', 'text/html')
            next(errorTemplate({status: 500, message: 'internal server error'}))
          } else {
            next({ error: 'internal server error' })
          }
        } else {
          // socket should be already closed
        }
      }
    }
    next()
  }

  app.use(Middleware.log)
  app.use(error_reporting_middleware)
  app.use(function(req, res, next) {
    res.setHeader('X-Powered-By', config.user_agent)
    next()
  })
  app.use(Cats.middleware)
  app.use(compression())

  app.get('/favicon.ico', function(req, res, next) {
    req.url = '/-/static/favicon.png'
    next()
  })

/*  app.get('/-/all', function(req, res) {
    var https = require('https')
    var JSONStream = require('JSONStream')
    var request = require('request')({
      url: 'https://registry.npmjs.org/-/all',
    })
    .pipe(JSONStream.parse('*'))
    .on('data', function(d) {
      console.log(d)
    })
  })*/

  // hook for tests only
  if (config._debug) {
    app.get('/-/_debug', function(req, res, next) {
      var do_gc = typeof(global.gc) !== 'undefined'
      if (do_gc) global.gc()
      next({
        pid  : process.pid,
        main : process.mainModule.filename,
        conf : config.self_path,
        mem  : process.memoryUsage(),
        gc   : do_gc,
      })
    })
  }

  app.use(require('./index-api')(config, auth, storage))

  if (config.web && config.web.enable === false) {
    app.get('/', function(req, res, next) {
      next( Error[404]('web interface is disabled in the config file') )
    })
  } else {
    app.use(require('./index-web')(config, auth, storage))
  }

  app.get('/*', function(req, res, next) {
    next( Error[404]('file not found') )
  })

  app.use(function(err, req, res, next) {
    if (Object.prototype.toString.call(err) !== '[object Error]') return next(err)
    if (err.code === 'ECONNABORT' && res.statusCode === 304) return next()
    if (typeof(res.report_error) !== 'function') {
      // in case of very early error this middleware may not be loaded before error is generated
      // fixing that
      error_reporting_middleware(req, res, function(){})
    }
    res.report_error(err)
  })

  app.use(Middleware.final)

  return app
}

