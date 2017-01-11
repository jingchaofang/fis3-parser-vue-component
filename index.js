var path = require('path');
var chalk = require('chalk')
var objectAssign = require('object-assign');
var hashSum = require('hash-sum');
var parser = require('./lib/parser');
var transpile = require('vue-template-es2015-compiler');

// exports
module.exports = function(content, file, conf) {
  var scriptStr = '';
  var templateFileName, templateFile, templateContent;
  var fragment, output, configs, vuecId, jsLang;

  // configs
  configs = objectAssign({
    cssScopedFlag: '__vuec__',
    cssScopedIdPrefix: '_v-',
    cssScopedHashType: 'sum',
    cssScopedHashLength: 8,
    styleNameJoin: '',

    runtimeOnly: false,
  }, conf);

  // replace scoped flag
  function replaceScopedFlag(str) {
    var reg = new RegExp('([^a-zA-Z0-9\-_])('+ configs.cssScopedFlag +')([^a-zA-Z0-9\-_])', 'g');
    str = str.replace(reg, function($0, $1, $2, $3) {
      return $1 + vuecId + $3;
    });
    return str;
  }

  // 兼容content为buffer的情况
  content = content.toString();

  // scope replace
  if (configs.cssScopedType == 'sum') {
    vuecId = configs.cssScopedIdPrefix + hashSum(file.subpath);
  } else {
    vuecId = configs.cssScopedIdPrefix + fis.util.md5(file.subpath, configs.cssScopedHashLength);
  }
  content = replaceScopedFlag(content);

  // parse
  var output = parser.parseComponent(content.toString(), { pad: true });

  // script
  if (output.script) {
    scriptStr = output.script.content;
    jsLang = output.script.lang || 'js';
  } else {
    scriptStr += 'module.exports = {}';
    jsLang = 'js';
  }

  // template
  if (output.template) {
    templateContent = fis.compile.partial(output.template.content, file, {
      ext: output.template.lang || 'html',
      isHtmlLike: true
    });

    scriptStr += '\n;\n(function(template){\n'
    scriptStr += '\nmodule && module.exports && (module.exports.template = template);\n';
    scriptStr += '\nexports && exports.default && (exports.default.template = template);\n';
    scriptStr += '\n})(' + JSON.stringify(templateContent) + ');\n';
  } else {
    scriptStr += '\nmodule && module.exports && (module.exports.template = "");\n';
    scriptStr += '\nexports && exports.default && (exports.default.template = "");\n';
  }

  // 部分内容以 js 的方式编译一次。如果要支持 es6 需要这么配置。
  // fis.match('*.vue:js', {
  //   parser: fis.plugin('babel-6.x')
  // })
  scriptStr = fis.compile.partial(scriptStr, file, {
    ext: jsLang,
    isJsLike: true
  });

  // style
  output['styles'].forEach(function(item, index) {
    if (item.content) {
      var styleFileName, styleFile, styleContent;

      if (output['styles'].length == 1) {
        styleFileName = file.realpathNoExt + configs.styleNameJoin + '.css';
      } else {
        styleFileName = file.realpathNoExt + configs.styleNameJoin + '-' + index + '.css';
      }

      styleFile = fis.file.wrap(styleFileName);

      // css也采用片段编译，更好的支持less、sass等其他语言
      styleContent = fis.compile.partial(item.content, file, {
        ext: item.lang || 'css',
        isCssLike: true
      });

      styleFile.cache = file.cache;
      styleFile.isCssLike = true;
      styleFile.setContent(styleContent);
      fis.compile.process(styleFile);
      styleFile.links.forEach(function(derived) {
        file.addLink(derived);
      });
      file.derived.push(styleFile);
      file.addRequire(styleFile.getId());
    }
  });

  // 处理一遍scoped css
  scriptStr = replaceScopedFlag(scriptStr);

  return scriptStr;
};
