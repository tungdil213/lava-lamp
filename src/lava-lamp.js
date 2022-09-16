import {TweenMax} from "greensock";
var canvas;
var gl;
var realToCSSPixels = window.devicePixelRatio;
var displayWidth;
var displayHeight;
var rings;
var createdMetaballs = [];
var assetsIndexToLoad = 0;
var assetsToLoad = [
  { path: '/', src: 'texture.png', name: 'noise3', type: 'texture' },
];
var assets = {};

function Metaballs(gl, config, targetScreenSize) {
  var program;
  var metaballsObjects = [];
  var metaballsObjectsHandle;
  var timeUniform;
  var resolutionUniform;
  var time = 0.0;
  var colorTexture;
  var noiseTexture;
  var animationProperties = {
    radiusMultiplier: 0.0,
    positionMultiplier: 0.5,
  };
  var mousePosition = { x: 0, y: 0 };
  targetScreenSize = targetScreenSize != undefined ? targetScreenSize : null;

  function getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  function initializeShader() {
    var vertexShaderSource = compileShader(
      document.getElementById('vertexMetaballs').textContent,
      gl.VERTEX_SHADER
    );
    var fragmentShaderSource = compileShader(
      document.getElementById('fragmentMetaballs').textContent,
      gl.FRAGMENT_SHADER
    );

    program = gl.createProgram();
    gl.attachShader(program, vertexShaderSource);
    gl.attachShader(program, fragmentShaderSource);
    gl.linkProgram(program);
    gl.useProgram(program);

    /**
     * Geometry setup
     */
    // Set up 4 vertices, which we'll draw as a rectangle
    // via 2 triangles
    //
    //   A---C
    //   |  /|
    //   | / |
    //   |/  |
    //   B---D
    //
    // We order them like so, so that when we draw with
    // gl.TRIANGLE_STRIP, we draw triangle ABC and BCD.
    var vertexData = new Float32Array([
      -1.0,
      1.0, // top left
      -1.0,
      -1.0, // bottom left
      1.0,
      1.0, // top right
      1.0,
      -1.0, // bottom right
    ]);
    var vertexDataBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexDataBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

    // To make the geometry information available in the shader as attributes, we
    // need to tell WebGL what the layout of our data in the vertex buffer is.
    var positionHandle = getAttribLocation(program, 'position');

    gl.enableVertexAttribArray(positionHandle);
    gl.vertexAttribPointer(
      positionHandle,
      2, // position is a vec2
      gl.FLOAT, // each component is a float
      gl.FALSE, // don't normalize values
      2 * 4, // two 4 byte float components per vertex
      0 // offset into each span of vertex data
    );

    /**
     * SETUP UNIFORMS
     */
    metaballsObjectsHandle = getUniformLocation(program, 'metaballs');

    timeUniform = getUniformLocation(program, 'uTime');
    gl.uniform1f(timeUniform, 0.0);

    colorTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      config.texture
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'uColorSampler'), 0);

    noiseTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      assets['noise3']
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'uNoiseSampler'), 1);

    resolutionUniform = getUniformLocation(program, 'uResolution');
    gl.uniform2f(resolutionUniform, gl.canvas.width, gl.canvas.height);
  }

  /**
   * SHADER INITIALIZATION
   */
  // Utility to fail loudly on shader compilation failure
  function compileShader(shaderSource, shaderType) {
    var shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw 'Shader compile failed with: ' + gl.getShaderInfoLog(shader);
    }
    return shader;
  }

  /**
   * Attribute setup
   */
  // Utility to complain loudly if we fail to find the attribute
  function getAttribLocation(program, name) {
    var attributeLocation = gl.getAttribLocation(program, name);
    if (attributeLocation === -1) {
      throw 'Can not find attribute ' + name + '.';
    }
    return attributeLocation;
  }

  /**
   * Uniform setup
   */
  // Utility to complain loudly if we fail to find the uniform
  function getUniformLocation(program, name) {
    var uniformLocation = gl.getUniformLocation(program, name);
    if (uniformLocation === -1) {
      throw 'Can not find uniform ' + name + '.';
    }
    return uniformLocation;
  }

  /**
   *  Attributes setup
   */
  var dataToSendToGPU;
  function setupAttributes() {
    time += 0.01;
    var count = config.metaballs.length;
    var centerX = displayWidth * 0.5;
    var centerY = displayHeight * 0.5;

    var radius = 30;
    for (var i = 0; i < count; i++) {
      var mb = config.metaballs[i];
      mb.x = centerX + mb.centerOffsetX; // * animationProperties.positionMultiplier;
      mb.y = centerY + mb.centerOffsetY; // * animationProperties.positionMultiplier;
      mb.targRadius =
        mb.radius +
        (Math.cos((mb.t + time) * mb.speed) * 5 +
          Math.sin((mb.t + time) * mb.speed) * 5); // * animationProperties.positionMultiplier;
    }

    dataToSendToGPU = new Float32Array(3 * count);
    for (var i = 0; i < count; i++) {
      var baseIndex = 3 * i;
      var mb = metaballsObjects[i];

      dataToSendToGPU[baseIndex + 0] = mb.x;
      dataToSendToGPU[baseIndex + 1] = mb.y;
      dataToSendToGPU[baseIndex + 2] = mb.radius; // * animationProperties.radiusMultiplier;
      //dataToSendToGPU[baseIndex + 2] = mb.targRadius * animationProperties.radiusMultiplier;
    }
    gl.uniform3fv(metaballsObjectsHandle, dataToSendToGPU);
  }
  /**
   * Simulation setup
   */
  function setupSimulation() {
    metaballsObjects = config.metaballs;
    var metaball;
    var centerX = displayWidth * 0.5;
    var centerY = displayHeight * 0.5;
    for (var i = 0, total = metaballsObjects.length; i < total; i++) {
      metaball = metaballsObjects[i];
      metaball.ox = metaball.x = centerX + metaball.centerOffsetX;
      metaball.oy = metaball.y = centerY + metaball.centerOffsetY;
    }
  }

  this.fadeIn = function () {
    //TweenMax.to(animationProperties, 2.0, {radiusMultiplier:1.0, delay:0., ease:Elastic.easeOut.config(1, 0.4) });
    //TweenMax.to(animationProperties, 1.7, {radiusMultiplier:1.0, delay:0., ease:Power2.easeInOut });
    //TweenMax.to(animationProperties, 2.4, {positionMultiplier:1.0, delay:0.0, ease:Power1.easeInOut});
    TweenMax.to(animationProperties, 0.7, {
      radiusMultiplier: 1.0,
      delay: 0,
    //   ease: Back.easeOut,
    });
    TweenMax.to(animationProperties, 0.4, {
      positionMultiplier: 1.0,
      delay: 0.0,
    //   ease: Back.easeOut,
    });
  };

  /**
   * Handle Resize
   */
  this.handleResize = function (width, height) {
    gl.useProgram(program);
    gl.uniform2f(resolutionUniform, width, height);
  };

  /**
   * Handle Mouse Move
   */
  this.handleMouseMove = function (x, y) {
    mousePosition.x = x;
    mousePosition.y = window.innerHeight - y;
  };

  /**
   * Update Simulation
   */
  this.updateSimulation = function () {
    time += 0.01;

    var resolutionScale = Math.min(
      window.innerWidth / (targetScreenSize != null ? targetScreenSize : 1920),
      1.0
    );

    // Update positions and speeds
    var count = config.metaballs.length;
    var centerX = displayWidth * 0.5;
    var centerY = displayHeight * 0.5;

    var radius = 30;
    var targX, targY, t, d, mb;
    for (var i = 0; i < count; i++) {
      mb = metaballsObjects[i];
      //mb.x = centerX + (mb.centerOffsetX + ( Math.sin( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierX ) + ( Math.sin( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierX )) * animationProperties.positionMultiplier;
      //mb.y = centerY + (mb.centerOffsetY + ( Math.cos( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierY ) + ( Math.cos( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierY )) * animationProperties.positionMultiplier;
      //mb.targRadius = mb.radius + (( Math.cos( ( mb.t + time ) * mb.speed ) * 5 ) + ( Math.sin( ( mb.t + time ) * mb.speed ) * 5 )) * animationProperties.positionMultiplier;

      //mb.x = centerX + (mb.centerOffsetX * resolutionScale + ( Math.sin( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierX ) + ( Math.sin( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierX )) * animationProperties.positionMultiplier;
      //mb.y = centerY + (mb.centerOffsetY * resolutionScale + ( Math.cos( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierY ) + ( Math.cos( ( mb.t + time ) * mb.speed ) * radius * mb.arcMultiplierY )) * animationProperties.positionMultiplier;
      targX =
        centerX +
        (mb.centerOffsetX * resolutionScale +
          Math.sin((mb.t + time) * mb.speed) * radius * mb.arcMultiplierX +
          Math.sin((mb.t + time) * mb.speed) * radius * mb.arcMultiplierX) *
          animationProperties.positionMultiplier;
      targY =
        centerY +
        (mb.centerOffsetY * resolutionScale +
          Math.cos((mb.t + time) * mb.speed) * radius * mb.arcMultiplierY +
          Math.cos((mb.t + time) * mb.speed) * radius * mb.arcMultiplierY) *
          animationProperties.positionMultiplier;

      t = Math.atan2(mb.x - mousePosition.x, mb.y - mousePosition.y);
      d =
        500 /
        Math.sqrt(
          Math.pow(mousePosition.x - mb.x, 2) +
            Math.pow(mousePosition.y - mb.y, 2)
        );
      mb.x += d * Math.sin(t) + (targX - mb.x) * 0.1;
      mb.y += d * Math.cos(t) + (targY - mb.y) * 0.1;
    }

    // To send the data to the GPU, we first need to
    // flatten our data into a single array.
    //var dataToSendToGPU = new Float32Array(3 * count);
    for (var i = 0; i < count; i++) {
      var baseIndex = 3 * i;
      var mb = metaballsObjects[i];
      dataToSendToGPU[baseIndex + 0] = mb.x;
      dataToSendToGPU[baseIndex + 1] = mb.y;
      dataToSendToGPU[baseIndex + 2] =
        mb.radius * animationProperties.radiusMultiplier * resolutionScale;
    }

    gl.useProgram(program);
    gl.uniform1f(timeUniform, time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
    gl.enable(gl.BLEND);
    //gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform3fv(metaballsObjectsHandle, dataToSendToGPU);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  initializeShader();
  setupSimulation();
  setupAttributes();
}

export function preloadAssets() {
  function checkIfAllAssetsAreLoaded() {
    if (assetsIndexToLoad < assetsToLoad.length) {
      loadAssetIndex(assetsIndexToLoad);
    } else {
      initialize();
    }
  }

  function loadAssetIndex(index) {
    var objectToLoad = assetsToLoad[index];

    switch (objectToLoad.type) {
      case 'texture':
        var image = new Image();
        image.onload = function (event) {
          assets[objectToLoad.name] = this;
          assetsIndexToLoad++;
          checkIfAllAssetsAreLoaded();
        };
        image.crossOrigin = '';
        image.src = objectToLoad.path + objectToLoad.src;
        break;
    }
  }

  loadAssetIndex(assetsIndexToLoad);
}

function initialize() {
  canvas = document.getElementById('metaball-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var glConfig = {
    premultipliedAlpha: true,
    antialias: true,
    depth: true,
    alpha: true,
  };

  gl =
    canvas.getContext('webgl', glConfig) ||
    canvas.getContext('experimental-webgl', glConfig);

  if (!gl) {
    console.error('cannot find gl', gl);
    return;
  }
  displayWidth = Math.floor(gl.canvas.clientWidth / realToCSSPixels);
  displayHeight = Math.floor(gl.canvas.clientHeight / realToCSSPixels);

  var minSpeed = 0.2;
  var maxSpeed = 2.5;
  var minMultiplierArcX = -0.25;
  var maxMultiplierArcX = 0.75;
  var minMultiplierArcY = -0.25;
  var maxMultiplierArcY = 0.25;
  var scale = 1.0;

  var metaballsGroup1 = {
    metaballs: [
      {
        centerOffsetX: 26 * scale,
        centerOffsetY: 155 * scale,
        radius: 70 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -110 * scale,
        centerOffsetY: 10 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 12 * scale,
        centerOffsetY: -114 * scale,
        radius: 48 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -300 * scale,
        centerOffsetY: 20 * scale,
        radius: 160 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -570 * scale,
        centerOffsetY: -20 * scale,
        radius: 50 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
    ],
    texture: generateGradientTexture(
      [
        { color: '#e24926', stop: 0.2 },
        { color: '#c8246c', stop: 0.35 },
        { color: '#40204c', stop: 0.55 },
        { color: '#e24926', stop: 0.75 },
        { color: '#40204c', stop: 1.0 },
      ],
      false,
      false
    ),
  };
  var metaballsGroup2 = {
    metaballs: [
      {
        centerOffsetX: -290 * scale,
        centerOffsetY: 60 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -100 * scale,
        centerOffsetY: 45 * scale,
        radius: 70 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -60 * scale,
        centerOffsetY: 60 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 160 * scale,
        centerOffsetY: 170 * scale,
        radius: 90 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 310 * scale,
        centerOffsetY: 40 * scale,
        radius: 40 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 450 * scale,
        centerOffsetY: -120 * scale,
        radius: 50 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 230 * scale,
        centerOffsetY: -240 * scale,
        radius: 70 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 320 * scale,
        centerOffsetY: -130 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 110 * scale,
        centerOffsetY: -70 * scale,
        radius: 80 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },

      {
        centerOffsetX: -1070 * scale,
        centerOffsetY: -500 * scale,
        radius: 20 * scale,
        speed: getRandomFloat(0.07, 0.014),
        t: 0.0,
        arcMultiplierX: getRandomFloat(30.0, 30.0),
        arcMultiplierY: getRandomFloat(10.0, 10.0),
      },
    ],
    texture: generateGradientTexture(
      [
        { color: '#e24926', stop: 0.0 },
        { color: '#e24926', stop: 0.3 },
        { color: '#c8246c', stop: 0.4 },
        { color: '#40204c', stop: 0.7 },
      ],
      true,
      false
    ),
  };
  var metaballsGroup3 = {
    metaballs: [
      {
        centerOffsetX: 410 * scale,
        centerOffsetY: -120 * scale,
        radius: 18 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 340 * scale,
        centerOffsetY: -200 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 200 * scale,
        centerOffsetY: -190 * scale,
        radius: 40 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 250 * scale,
        centerOffsetY: -280 * scale,
        radius: 16 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
    ],
    texture: generateGradientTexture(
      [
        { color: '#e24926', stop: 0.56 },
        { color: '#c8246c', stop: 0.63 },
        { color: '#40204c', stop: 0.7 },
      ],
      false,
      false
    ),
  };
  var metaballsGroup4 = {
    metaballs: [
      {
        centerOffsetX: -410 * scale,
        centerOffsetY: -270 * scale,
        radius: 28 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -490 * scale,
        centerOffsetY: -230 * scale,
        radius: 34 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -470 * scale,
        centerOffsetY: -320 * scale,
        radius: 40 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -470 * scale,
        centerOffsetY: 320 * scale,
        radius: 40 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -430 * scale,
        centerOffsetY: 360 * scale,
        radius: 30 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
    ],
    texture: generateGradientTexture(
      [
        { color: '#e24926', stop: 0.1 },
        { color: '#c8246c', stop: 0.2 },
        { color: '#40204c', stop: 0.4 },
      ],
      false,
      false
    ),
  };
  var metaballsGroup5 = {
    metaballs: [
      {
        centerOffsetX: -500 * scale,
        centerOffsetY: -100 * scale,
        radius: 24 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 30 * scale,
        centerOffsetY: -120 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 480 * scale,
        centerOffsetY: 170 * scale,
        radius: 21 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
    ],
    texture: generateGradientTexture(
      [
        { color: '#e24926', stop: 0.25 },
        { color: '#c8246c', stop: 0.6 },
        { color: '#40204c', stop: 0.78 },
      ],
      true,
      false
    ),
  };
  var metaballsGroup6 = {
    metaballs: [
      {
        centerOffsetX: 820 * scale,
        centerOffsetY: 20 * scale,
        radius: 200 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 480 * scale,
        centerOffsetY: 30 * scale,
        radius: 70 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 500 * scale,
        centerOffsetY: -10 * scale,
        radius: 65 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 1080 * scale,
        centerOffsetY: 30 * scale,
        radius: 35 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 400 * scale,
        centerOffsetY: 160 * scale,
        radius: 55 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: 350 * scale,
        centerOffsetY: -120 * scale,
        radius: 75 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },

      {
        centerOffsetX: 1670 * scale,
        centerOffsetY: 500 * scale,
        radius: 15 * scale,
        speed: getRandomFloat(0.21, 0.22),
        t: 13.0,
        arcMultiplierX: 30.0,
        arcMultiplierY: 6.0,
      },
    ],
    texture: generateGradientTexture(
      [
        { color: '#e24926', stop: 0.0 },
        { color: '#e24926', stop: 0.7 },
        { color: '#c8246c', stop: 0.8 },
        { color: '#40204c', stop: 1.0 },
      ],
      false,
      false
    ),
  };
  var metaballsGroup7 = {
    metaballs: [
      {
        centerOffsetX: -930 * scale,
        centerOffsetY: 40 * scale,
        radius: 30 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -800 * scale,
        centerOffsetY: 90 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -640 * scale,
        centerOffsetY: 270 * scale,
        radius: 50 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -590 * scale,
        centerOffsetY: 150 * scale,
        radius: 90 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -400 * scale,
        centerOffsetY: 240 * scale,
        radius: 40 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -300 * scale,
        centerOffsetY: 120 * scale,
        radius: 35 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -450 * scale,
        centerOffsetY: 50 * scale,
        radius: 70 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -590 * scale,
        centerOffsetY: -40 * scale,
        radius: 60 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
      {
        centerOffsetX: -370 * scale,
        centerOffsetY: -70 * scale,
        radius: 50 * scale,
        speed: getRandomFloat(minSpeed, maxSpeed),
        t: Math.random() * 200,
        arcMultiplierX: getRandomFloat(minMultiplierArcX, maxMultiplierArcX),
        arcMultiplierY: getRandomFloat(minMultiplierArcY, maxMultiplierArcY),
      },
    ],
    texture: generateGradientTexture(
      [
        { color: '#e24926', stop: 0.2 },
        { color: '#c8246c', stop: 0.4 },
        { color: '#40204c', stop: 0.7 },
      ],
      true,
      false
    ),
  };

  createdMetaballs.push(new Metaballs(gl, metaballsGroup6));
  createdMetaballs.push(new Metaballs(gl, metaballsGroup7));
  createdMetaballs.push(new Metaballs(gl, metaballsGroup2));
  createdMetaballs.push(new Metaballs(gl, metaballsGroup1));
  createdMetaballs.push(new Metaballs(gl, metaballsGroup3));
  createdMetaballs.push(new Metaballs(gl, metaballsGroup4));
  createdMetaballs.push(new Metaballs(gl, metaballsGroup5));

  for (var i = 0; i < createdMetaballs.length; i++) {
    setTimeout(createdMetaballs[i].fadeIn, i * 200);
  }
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onWindowMouseMove);

  resizeGL(gl);

  step();
}

function generateGradientTexture(colors, vertical, debug) {
  colors = colors || [
    { color: '#000000', stop: 0.0 },
    { color: '#FFF000', stop: 0.5 },
    { color: '#642054', stop: 1.0 },
  ];
  vertical = vertical !== undefined ? vertical : false;

  var size = 512;

  // create canvas
  var textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;

  if (debug == true) {
    textureCanvas.style.position = 'absolute';
    textureCanvas.style.top = '0px';
    textureCanvas.style.left = '0px';
    document.body.appendChild(textureCanvas);
  }

  // get context
  var context = textureCanvas.getContext('2d');

  // draw gradient
  context.rect(0, 0, size, size);

  var grd = vertical
    ? context.createLinearGradient(0, size, 0, 0)
    : context.createLinearGradient(0, 0, size, 0);
  for (var i = 0; i < colors.length; i++) {
    grd.addColorStop(colors[i].stop, colors[i].color);
  }
  context.fillStyle = grd;
  context.fillRect(0, 0, size, size);

  return textureCanvas;
}

function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function onWindowResize(event) {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  resizeGL(gl);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

function onWindowMouseMove(event) {
  createdMetaballs.forEach(function (metaball) {
    metaball.handleMouseMove(event.clientX, event.clientY);
  });
}

function resizeGL(gl) {
  realToCSSPixels = window.devicePixelRatio;

  // Lookup the size the browser is displaying the canvas in CSS pixels
  // and compute a size needed to make our drawingbuffer match it in
  // device pixels.
  displayWidth = Math.floor(gl.canvas.clientWidth /** realToCSSPixels*/);
  displayHeight = Math.floor(gl.canvas.clientHeight /** realToCSSPixels*/);

  // Check if the canvas is not the same size.
  if (gl.canvas.width !== displayWidth || gl.canvas.height !== displayHeight) {
    // Make the canvas the same size
    gl.canvas.width = displayWidth;
    gl.canvas.height = displayHeight;
  }

  console.log(displayWidth, '___________>>> ', gl.canvas.width);

  gl.viewport(0, 0, displayWidth, displayHeight);

  createdMetaballs.forEach(function (metaball) {
    metaball.handleResize(displayWidth, displayHeight);
  });
}

var step = function () {
  createdMetaballs.forEach(function (metaball) {
    metaball.updateSimulation();
  });
  requestAnimationFrame(step);
};
