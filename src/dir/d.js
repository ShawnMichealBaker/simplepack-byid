// module d

let a = require('./a.js');

module.exports = function () {
    console.log('d');
    a();
};