var Handlebars        = require('handlebars')
var handlebarsLayouts = require('handlebars-layouts')
var fs                = require('fs')

var cachedHandlebars = null

module.exports = function (config) {
  if (!cachedHandlebars) {
    Handlebars.registerHelper(handlebarsLayouts(Handlebars))

    if (config.web && config.web.layout) {
      Handlebars.registerPartial('layout', fs.readFileSync(config.web.layout, 'utf8'))
    } else {
      Handlebars.registerPartial('layout', fs.readFileSync(require.resolve('./GUI/layout.hbs'), 'utf8'))
    }
    cachedHandlebars = Handlebars
  }

  return cachedHandlebars
}
