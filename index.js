#!/usr/bin/env node
var browserify = require('browserify')
var watchify = require('watchify')
var tsify = require('tsify')
var through = require('through')
var fs = require('fs')
var path = require('path')
var http = require('http')
var strip_json_comments = require('strip-json-comments')
var colors = require('colors/safe');

var fsDeepCopy = function (srcDir, dstDir) {
    var results = [];
    var list = fs.readdirSync(srcDir);
    var src, dst;
    list.forEach(function (file) {
        src = srcDir + '/' + file;
        dst = dstDir + '/' + file;
        var stat = fs.statSync(src);
        if (stat && stat.isDirectory()) {
            try {
                fs.mkdirSync(dst);
            } catch (e) { }
            results = results.concat(fsDeepCopy(src, dst));
        } else {
            try {
                fs.writeFileSync(dst, fs.readFileSync(src));
            } catch (e) { }
            results.push(src);
        }
    });
    return results;
};

(() => {
    {
        var originMethod = console.error
        console.error = function () {
            let args = []
            for (let index = 0; index < arguments.length; index++) {
                args.push(colors.red(arguments[index]))
            }
            originMethod.apply(undefined, args)
        }
    }
    {
        var originMethod = console.warn
        console.warn = function () {
            let args = []
            for (let index = 0; index < arguments.length; index++) {
                args.push(colors.yellow(arguments[index]))
            }
            originMethod.apply(undefined, args)
        }
    }
    {
        var originMethod = console.debug
        console.debug = function () {
            let args = []
            for (let index = 0; index < arguments.length; index++) {
                args.push(colors.blue(arguments[index]))
            }
            originMethod.apply(undefined, args)
        }
    }
    {
        var originMethod = console.info
        console.info = function () {
            let args = []
            for (let index = 0; index < arguments.length; index++) {
                args.push(colors.green(arguments[index]))
            }
            originMethod.apply(undefined, args)
        }
    }
})()

class ProjectManager {

    init() {
        if (!fs.existsSync("package.json")) {
            throw Error("You should run [npm init] first.")
        }
        fs.writeFileSync(".gitignore", `
node_modules/
.npm
npm-debug.log*
`)
        fs.mkdirSync('build')
        fs.mkdirSync('res')
        fs.mkdirSync('src')
        fs.writeFileSync('src/main.ts', `
class MainViewController extends UIViewController {

    fooLabel = new UILabel

    viewDidLoad() {
        super.viewDidLoad()
        this.fooLabel.textAlignment = UITextAlignment.center
        this.fooLabel.text = "Hello, World!"
        this.view.addSubview(this.fooLabel)
    }

    viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        this.fooLabel.frame = this.view.bounds
    }

}

global.main = new MainViewController
`)
        fs.writeFileSync('tsconfig.json', `{
    "compilerOptions": {
        "target": "es5",
        "module": "commonjs",
        "lib": [
            "esnext",
            "es2015.promise"
        ],
        "strict": true,
        "noImplicitAny": true,
        "strictNullChecks": true,
        "noImplicitThis": true,
        "alwaysStrict": true,
        "types": [
            "xt-studio"
        ]
    }
}`)
        const pkg = JSON.parse(fs.readFileSync('package.json', { encoding: "utf-8" }))
        const projectName = pkg.name
        pkg.scripts = {
            watch: `./node_modules/.bin/xt watch & ./node_modules/.bin/xt watch --output ./platform/ios/${projectName}/JSBundle/app.js & ./node_modules/.bin/xt watch --output ./platform/web/app.js & ./node_modules/.bin/xt watch --output ./platform/android/app/src/main/assets/app.js & ./node_modules/.bin/xt watch --wx --output ./platform/wx/src/app.js`,
            build: `./node_modules/.bin/xt build & ./node_modules/.bin/xt build --output ./platform/ios/${projectName}/JSBundle/app.js & ./node_modules/.bin/xt build --output ./platform/web/app.js & ./node_modules/.bin/xt build --output ./platform/android/app/src/main/assets/app.js & ./node_modules/.bin/xt build --wx --output ./platform/wx/src/app.js`,
            debug: './node_modules/.bin/xt debug',
            web: "cd platform/web && http-server -c-1",
            ios: "open platform/ios/*.xcworkspace",
            android: "",
        }
        fs.writeFileSync('package.json', JSON.stringify(pkg, undefined, 4))
    }

    copy() {
        fs.mkdirSync('./platform')
        fsDeepCopy('./node_modules/xt-studio/platform', './platform')
    }

    rename() {
        const pkg = JSON.parse(fs.readFileSync('package.json', { encoding: "utf-8" }))
        const projectName = pkg.name
        this._renameDirs(projectName, "platform")
    }

    _renameDirs(projectName, path) {
        fs.readdirSync(path).forEach(it => {
            if (it.indexOf("SimpleProject") >= 0 || it.indexOf("simpleproject") >= 0) {
                fs.renameSync(`${path}/${it}`, `${path}/${it.replace(/SimpleProject/ig, projectName)}`)
            }
        })
        fs.readdirSync(path).forEach(it => {
            if (fs.lstatSync(`${path}/${it}`).isDirectory()) {
                this._renameDirs(projectName, `${path}/${it}`)
            }
            else {
                this._renameContents(projectName, `${path}/${it}`)
            }
        })
    }

    _renameContents(projectName, path) {
        const contents = fs.readFileSync(path, { encoding: "utf-8" })
        if (typeof contents === "string") {
            try {
                fs.writeFileSync(path, contents.replace(/SimpleProject/ig, projectName))
            } catch (error) { }
        }
    }

}

class ResBundler {

    constructor() {
        this.contentCache = {}
    }

    files(dir) {
        var files = []
        try {
            var results = fs.readdirSync(dir)
            results.forEach(it => {
                if (it == ".DS_Store") { return }
                var subPaths = this.files(dir + "/" + it)
                if (subPaths instanceof Array) {
                    subPaths.forEach(it => {
                        files.push(it)
                    })
                }
                else {
                    files.push(dir + "/" + it)
                }
            })
        } catch (error) {
            return null
        }
        return files
    }

    bundle() {
        const files = this.files('res') || []
        return files.map((it) => {
            const content = this.contentCache[it] || fs.readFileSync(it).toString('base64')
            this.contentCache[it] = content
            return `Bundle.js.addResource("${it.replace('res/', '')}", "${content}");`
        }).join("\n")
    }

}

class SrcBundler {

    compilerOptions() {
        try {
            const tsconfig = fs.readFileSync('tsconfig.json', { encoding: "utf-8" })
            return JSON.parse(strip_json_comments(tsconfig)).compilerOptions
        } catch (error) {
            return {}
        }
    }

    createBrowserify(debug) {
        var instance = browserify({
            cache: {},
            packageCache: {},
            debug: debug,
        })
            .add('src/main.ts')
            .plugin(tsify, this.compilerOptions())
            .transform(function (file) {
                var data = '';
                return through(write, end);
                function write(buf) { data += buf }
                function end() {
                    if (file == path.resolve('src/main.ts')) {
                        data = resBundler.bundle() + "\n" + data
                    }
                    this.queue(data);
                    this.queue(null);
                }
            })
        if (debug !== true) {
            instance = instance.transform('uglifyify', { sourceMap: false })
        }
        return instance
    }

    watch(dest, debug) {
        const b = this.createBrowserify(debug)
        b.plugin(watchify)
            .on('update', () => {
                b.bundle(function (err) {
                    if (!err) {
                        if (dest === "node_modules/.tmp/app.js") {
                            fs.writeFileSync("node_modules/.tmp/app.js.version", new Date().getTime())
                        }
                        console.log("✅ Built at: " + new Date())
                    }
                })
                    .on('error', (error) => {
                        this.watchDelay(error, dest)
                    })
                    .pipe(fs.createWriteStream(dest));
                console.log("📌 Started at: " + new Date())
            })
        b.bundle(function (err) {
            if (!err) {
                if (dest === "node_modules/.tmp/app.js") {
                    fs.writeFileSync("node_modules/.tmp/app.js.version", new Date().getTime())
                }
                console.log("✅ Built at: " + new Date())
            }
        })
            .on('error', (error) => {
                this.watchDelay(error, dest)
            })
            .pipe(() => {
                const stream = fs.createWriteStream(dest, {
                    encoding: 'utf8'
                })
                if (this.wx === true) {
                    stream.write(`const { Bundle, Data, MutableData, DispatchQueue, FileManager, Timer, URL, URLRequestCachePolicy, URLRequest, MutableURLRequest, URLResponse, URLSession, URLSessionTaskState, URLSessionTask, UserDefaults, UUID, CADisplayLink, CAGradientLayer, CALayer, CAShapeFillRule, CAShapeLineCap, CAShapeLineJoin, CAShapeLayer, KMCore, UIActionSheet, UIActivityIndicatorView, UIAlert, UIAffineTransformIdentity, UIAffineTransformMake, UIAffineTransformMakeTranslation, UIAffineTransformMakeScale, UIAffineTransformMakeRotation, UIAffineTransformTranslate, UIAffineTransformScale, UIAffineTransformRotate, UIAffineTransformInvert, UIAffineTransformConcat, UIAffineTransformEqualToTransform, UIAffineTransformIsIdentity, UIAnimator, UIAttributedStringKey, UIParagraphStyle, UIAttributedString, UIMutableAttributedString, UIBezierPath, UIButton, UICollectionElementKindCell, UICollectionViewItemKey, UICollectionViewLayoutAttributes, UICollectionViewLayout, UICollectionView, UICollectionReusableView, UICollectionViewCell, UICollectionViewData, UICollectionViewScrollDirection, UIFlowLayoutHorizontalAlignment, UICollectionViewFlowLayout, UIColor, UIConfirm, UIDevice, UIEdgeInsetsZero, UIEdgeInsetsMake, UIEdgeInsetsInsetRect, UIEdgeInsetsEqualToEdgeInsets, UIViewContentMode, UIControlState, UIControlContentVerticalAlignment, UIControlContentHorizontalAlignment, UITextAlignment, UILineBreakMode, UITextFieldViewMode, UITextAutocapitalizationType, UITextAutocorrectionType, UITextSpellCheckingType, UIKeyboardType, UIReturnKeyType, UILayoutConstraintAxis, UIStackViewDistribution, UIStackViewAlignment, UIStatusBarStyle, UIFetchMoreControl, UIFont, UIGestureRecognizerState, UIGestureRecognizer, UIImageRenderingMode, UIImage, UIImageView, UILabel, UILongPressGestureRecognizer, UINavigationItem, UIBarButtonItem, UINavigationBar, UINavigationBarViewController, UINavigationController, UIPageViewController, UIPanGestureRecognizer, UIPinchGestureRecognizer, UIPointZero, UIPointMake, UIPointEqualToPoint, UIProgressView, UIRectZero, UIRectMake, UIRectEqualToRect, UIRectInset, UIRectOffset, UIRectContainsPoint, UIRectContainsRect, UIRectIntersectsRect, UIRectUnion, UIRectIsEmpty, UIRefreshControl, UIRotationGestureRecognizer, UIScreen, UIScrollView, UISizeZero, UISizeMake, UISizeEqualToSize, UISlider, UIStackView, UISwitch, UITabBarController, UITapGestureRecognizer, UITableView, UITableViewCell, UITextField, UITextView, UITouchPhase, UITouch, UIView, UIWindow, UIViewController, UIWebView } = require("xt-framework-wx")\n\n`)
                }
                return stream
            })
        console.log("📌 Started at: " + new Date())
    }

    watchDelay(error, dest) {
        if (this.lastError === undefined || error.message !== this.lastError.message) {
            this.lastError = error
            console.error(error)
            console.error("💔 Built failed: " + new Date())
            console.log("🚥 Compiler will try after 5 second.")
        }
        else {
            console.log("🚥 Still failed. Compiler will try after file changed.")
        }
    }

    build(dest) {
        const b = this.createBrowserify()
        b.bundle(function () {
            console.log("✅ Built at: " + new Date())
        })
            .pipe(() => {
                const stream = fs.createWriteStream(dest, {
                    encoding: 'utf8'
                })
                if (this.wx === true) {
                    stream.write(`const { Bundle, Data, MutableData, DispatchQueue, FileManager, Timer, URL, URLRequestCachePolicy, URLRequest, MutableURLRequest, URLResponse, URLSession, URLSessionTaskState, URLSessionTask, UserDefaults, UUID, CADisplayLink, CAGradientLayer, CALayer, CAShapeFillRule, CAShapeLineCap, CAShapeLineJoin, CAShapeLayer, KMCore, UIActionSheet, UIActivityIndicatorView, UIAlert, UIAffineTransformIdentity, UIAffineTransformMake, UIAffineTransformMakeTranslation, UIAffineTransformMakeScale, UIAffineTransformMakeRotation, UIAffineTransformTranslate, UIAffineTransformScale, UIAffineTransformRotate, UIAffineTransformInvert, UIAffineTransformConcat, UIAffineTransformEqualToTransform, UIAffineTransformIsIdentity, UIAnimator, UIAttributedStringKey, UIParagraphStyle, UIAttributedString, UIMutableAttributedString, UIBezierPath, UIButton, UICollectionElementKindCell, UICollectionViewItemKey, UICollectionViewLayoutAttributes, UICollectionViewLayout, UICollectionView, UICollectionReusableView, UICollectionViewCell, UICollectionViewData, UICollectionViewScrollDirection, UIFlowLayoutHorizontalAlignment, UICollectionViewFlowLayout, UIColor, UIConfirm, UIDevice, UIEdgeInsetsZero, UIEdgeInsetsMake, UIEdgeInsetsInsetRect, UIEdgeInsetsEqualToEdgeInsets, UIViewContentMode, UIControlState, UIControlContentVerticalAlignment, UIControlContentHorizontalAlignment, UITextAlignment, UILineBreakMode, UITextFieldViewMode, UITextAutocapitalizationType, UITextAutocorrectionType, UITextSpellCheckingType, UIKeyboardType, UIReturnKeyType, UILayoutConstraintAxis, UIStackViewDistribution, UIStackViewAlignment, UIStatusBarStyle, UIFetchMoreControl, UIFont, UIGestureRecognizerState, UIGestureRecognizer, UIImageRenderingMode, UIImage, UIImageView, UILabel, UILongPressGestureRecognizer, UINavigationItem, UIBarButtonItem, UINavigationBar, UINavigationBarViewController, UINavigationController, UIPageViewController, UIPanGestureRecognizer, UIPinchGestureRecognizer, UIPointZero, UIPointMake, UIPointEqualToPoint, UIProgressView, UIRectZero, UIRectMake, UIRectEqualToRect, UIRectInset, UIRectOffset, UIRectContainsPoint, UIRectContainsRect, UIRectIntersectsRect, UIRectUnion, UIRectIsEmpty, UIRefreshControl, UIRotationGestureRecognizer, UIScreen, UIScrollView, UISizeZero, UISizeMake, UISizeEqualToSize, UISlider, UIStackView, UISwitch, UITabBarController, UITapGestureRecognizer, UITableView, UITableViewCell, UITextField, UITextView, UITouchPhase, UITouch, UIView, UIWindow, UIViewController, UIWebView } = require("xt-framework-wx")\n\n`)
                }
                return stream
            });
        console.log("📌 Started at: " + new Date())
    }

    debug(port) {
        try {
            fs.mkdirSync('node_modules/.tmp')
        } catch (error) { }
        this.watch('node_modules/.tmp/app.js', true)
        http.createServer((request, response) => {
            response.setHeader("Access-Control-Allow-Origin", "*")
            response.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
            response.setHeader('Access-Control-Allow-Headers', '*');
            try {
                if (request.url === "/console") {
                    let body = '';
                    request.on('data', chunk => {
                        body += chunk.toString();
                    });
                    request.on('end', () => {
                        try {
                            let params = JSON.parse(body)
                            params.values.unshift("📝")
                            console[params.type].apply(this, params.values)
                        } catch (error) { }
                        response.end('ok');
                    });
                }
                else if (request.url === "/version") {
                    response.end(fs.readFileSync("node_modules/.tmp/app.js.version", { encoding: "utf-8" }))
                }
                else if (request.url === "/source") {
                    response.end(fs.readFileSync("node_modules/.tmp/app.js", { encoding: "utf-8" }))
                }
                else {
                    response.end("")
                }
            } catch (error) {
                response.end("")
            }
        }).listen(port)
        this.printIPs(port)
    }

    printIPs(port) {
        var os = require('os');
        var ifaces = os.networkInterfaces();
        Object.keys(ifaces).forEach(function (ifname) {
            var alias = 0;
            ifaces[ifname].forEach(function (iface) {
                if ('IPv4' !== iface.family || iface.internal !== false) {
                    return;
                }
                if (alias >= 1) {
                    console.log("Debug Server", iface.address, port);
                } else {
                    console.log("Debug Server", iface.address, port);
                }
                ++alias;
            });
        });
    }

}

const resBundler = new ResBundler()
const srcBundler = new SrcBundler()
srcBundler.wx = process.argv.indexOf("--wx") >= 0
const outputFile = process.argv.indexOf("--output") >= 0 ? process.argv[process.argv.indexOf("--output") + 1] : './build/app.js'

if (process.argv.includes('build')) {
    srcBundler.build(outputFile)
}
else if (process.argv.includes('watch')) {
    srcBundler.watch(outputFile)
}
else if (process.argv.includes('debug')) {
    const port = process.argv.indexOf("--port") >= 0 ? process.argv[process.argv.indexOf("--port") + 1] : 8090
    srcBundler.debug(port)
}
else if (process.argv.includes('init')) {
    const manager = new ProjectManager()
    manager.init()
    manager.copy()
    manager.rename()
}
else {
    srcBundler.build(outputFile)
}
