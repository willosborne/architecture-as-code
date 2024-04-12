const { Resolver } = require("@stoplight/spectral-ref-resolver");

module.exports = new Resolver({
  resolvers: {
    file: {
      async resolve(uri) {
        return undefined
      },
    },
  },
});