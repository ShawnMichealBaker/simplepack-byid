

const fs = require('fs');
const path = require('path');
const templateSingle = fs.readFileSync(path.join(__dirname, 'templateSingle.js'));
let mid = 0;  // module id
let cid = 0;  //chunk id

webpack();

function webpack() {
    const context = '/Users/mac/Desktop/code/webpack/simplepack-byid/';//根据项目所处目录去修改
    const entry = 'src/index.js';
    const output = 'dist/bundle.js';
    // 分析模块间的依赖关系,生成模块依赖关系
    let depTree = buildDeps(entry, context);
    // 拼接生成目标JS文件
    let buffer = [];
    let filename = path.resolve(context,output);
    buffer.push(templateSingle);
    buffer.push('/******/({\n');
    // 拼接modules进对应的chunk中
    let chunks = writeChunk(depTree, depTree.chunk);
    buffer.push(chunks);
    buffer.push('/******/})');
    buffer = buffer.join('');
    // 写文件
    fs.writeFile(filename, buffer, 'utf-8', function (err) {
        if (err) {
            throw err;
        }
    });
}

/**
 * 分析处理模块依赖
 * @param { string } entry 
 */
//function buildDeps(entry, context) {
function buildDeps(entry, context) {
    let depTree = {
        modulesByName: {},            // 通过模块名索引各个模块对象
        modulesById: {},           // 通过模块id索引模块对象
        chunk: {},             // 存储依赖块
        mapModuleNameToId: {}   // 用于映射模块名到模块id之间的关系
    };
    absoluteEntry = path.resolve(context, entry);//获取入口文件的绝对路径
    context = path.dirname(absoluteEntry);//获取入口文件所在的上下文
    // 构造依赖树模型的 modulesByName modulesById 和 NameToId 三个部分
    // （先把所有的modules放到树上 modules里有require）
    depTree = parseModule(depTree, absoluteEntry, context);
    // 给 modulesByName（modulesById）中的对象所require的对象添加id 将来生成目标JS文件的时候会用到
    // modulesByName 和 modulesById 中的每一个对象的指向是一样的对象
    depTree = addIdToRequiredModule(depTree);
    // 构造依赖树模型的 chunk 部分
    depTree = buildTree(depTree);
    return depTree;
}

/**
 * 分析模块
 * @param {*} depTree 
 * @param {*} moduleName 模块的绝对路径
 */
function parseModule(depTree, moduleName, context) {
    let module;
    // 用模块的绝对路径作为模块的键值,保证不重复加载文件
    module = depTree.modulesByName[moduleName] = {
        id: mid++,
        name: moduleName
    };
    // 根据绝对路径，读取文件源码
    let source = fs.readFileSync(moduleName).toString();
    // 将源码中依赖的模块转换成绝对路径
    source = parseRequireName(source, context);
    // 将源码转换为对象模型 模型中记录了依赖和源码
    let parsedModule = parse(source);
    // 放到depTree上
    module.requires = parsedModule.requires || [];
    module.source = parsedModule.source;
    // 写入id和name（绝对路径）的映射关系
    depTree.mapModuleNameToId[moduleName] = mid - 1;
    depTree.modulesById[mid - 1] = module;
    // 如果此模块有依赖的模块,采取深度优先的原则,遍历解析其依赖的模块
    let requireModules = parsedModule.requires;
    if (requireModules && requireModules.length > 0) {
        for (let require of requireModules) {
            // 如果有依赖 再其解析依赖
            console.log(context);
            // 切换到依赖的文件所在的上下文中
            let tempContext = path.dirname(require.name);
            console.log(tempContext);
            depTree = parseModule(depTree, require.name, tempContext);
        }
    }
    return depTree;
}

/**
 * 将源码转换为模型
 * @param {string} source 
 */
function parseRequireName(source, context) {
    const regEx = /require\(.*\)/g;// require(***)
    var params = [];
    var param;
    while ((param = regEx.exec(source)) !== null) {
        let value = param[0].replace('require(', '').replace(')', '').replace(/'/g, '');
        let absolute = path.resolve(context, value);
        source = source.replace(value, absolute);
    }
    return source;
};

/**
 * 将源码转换为模型
 * @param {string} source 
 */
function parse(source) {
    let localModule = {};
    localModule.requires = [];
    // 从source里面找require函数 找到后把其参数的值和范围放到 localModule.requires数组里
    // localModule.requires.push({ name: param.value, nameRange: param.range })
    // value是一个字符串 'a' 或者 "a" 这样
    // range是一个数组 [开始位置,结束位置]
    // 其实就是获取require的第一个参数 以及这个字符串从哪儿到哪
    // 匹配 require(***) 返回 ***.trim() 以及范围
    const regEx = /require\(.*\)/g;
    var params = [];
    var param;
    while ((param = regEx.exec(source)) !== null) {
        //params.push(param);
        let value = param[0].replace('require(', '').replace(')', '').replace(/'/g, '');
        // param.index + 8 加的是 'require(' 8个字符
        // regEx.lastIndex - 1 减的是 ')' 1个字符
        // 得到的是 参数名的范围
        let range = [param.index + 8, regEx.lastIndex - 1];
        localModule.requires.push({ name: value, nameRange: range });
    }
    localModule.source = source;
    return localModule;
};

/**
 * 写入依赖模块的id,生成目标JS文件的时候会用到
 * @param {object} depTree 
 */
function addIdToRequiredModule(depTree) {
    // 遍历modulesByName中的模块 （modulesByName中的模块不会重复）
    for (moduleName in depTree.modulesByName) {
        //根据moduleName从depTree.modulesByName中获取对象 对象的requires数组里记录了依赖的每一个模块
        let requireModules = depTree.modulesByName[moduleName].requires;
        if (requireModules && requireModules.length > 0) {
            requireModules.forEach(requireItem => {
                // requires 里面是一个一个的对象 对象里记录了引用的模块的绝对路径名和绝对路径名字符串的范围 { name: value, nameRange: range 
                // 现在在加一个id 
                requireItem.id = depTree.mapModuleNameToId[requireItem.name]
            })
        }
    }
    return depTree;
}

function buildTree(depTree) {
    let chunk = {
        id: cid++,
        modules: {}
    };
    depTree.chunk = chunk;// chunk的依赖的结构
    depTree.modulesById[0].chunkId = chunk.id;// 入口文件的chunkId是0
    addModuleToChunk(depTree, depTree.modulesById[0], chunk.id);
    return depTree;
}

function addModuleToChunk(depTree, context, chunkId) {
    depTree.chunk.modules[context.id] = 'include';//在depTree的根上的chunk 里记录其所依赖的模块的id 并标记为include 如果有重复的id只会把之前的覆盖 所以不会重复
    if (context.requires) {
        context.requires.forEach(requireItem => {
            if (requireItem.name) {
                addModuleToChunk(depTree, depTree.modulesByName[requireItem.name], chunkId);
            }
        })
    }
    return depTree;
}

function writeChunk(depTree, chunk) {
    let modules = chunk.modules;
    let buffer = [];
    for (let moduleName in modules) {
        let module = depTree.modulesById[moduleName];
        buffer.push('/******/');
        buffer.push(module.id);
        buffer.push(': function(module, exports, require) {\n\n');
        // 调用此方法,拼接每一个具体的模块的内部内容
        buffer.push(writeSource(module, depTree));
        buffer.push('\n\n/******/},\n/******/\n');
    }
    return buffer.join('');
}

/**
 * 将源码中reqire的module的name替换成id
 * @param {*} module 
 * @param {*} depTree 
 */
function writeSource(module, depTree) {
    let replaces = [];
    let source = module.source;
    if (!module.requires || !module.requires.length) return source;

    /**
     * 收集模块中的require
     * @param {object} requireItem 依赖的模块
     */
    function genReplaceRequire(requireItem) {
        if (!requireItem.nameRange || !requireItem.name) return;
        let prefix = `/* ${requireItem.name} */`;
        replaces.push({
            from: requireItem.nameRange[0],
            to: requireItem.nameRange[1],
            value: prefix + (requireItem.id || depTree.mapModuleNameToId[requireItem.name])
        });
        // TODO 此处通过模块名来索引id,可能存在一定的隐患
    }

    if (module.requires) {
        module.requires.forEach(genReplaceRequire);
    }

    // 排序,从后往前地替换模块名,这样才能保证正确替换所有的模块
    replaces.sort((a, b) => {
        return b.from - a.from;
    });

    // 逐个替换模块名为模块id,此处算法颇为精妙,赞!
    let result = [source];
    replaces.forEach(replace => {
        let remainSource = result.shift();
        result.unshift(
            remainSource.substr(0, replace.from),
            replace.value,
            remainSource.substr(replace.to)
        )
    });

    return result.join('');
}
