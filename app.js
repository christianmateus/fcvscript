// Required modules
const fs = require('fs');
const log4js = require("log4js");

log4js.configure({
   appenders: {
      everything: { type: 'file', filename: 'log.txt', flags: 'w', layout: { type: "messagePassThrough" } }
   },
   categories: { default: { appenders: ['everything'], level: 'debug' } }
});

let logger = log4js.getLogger();
logger.debug("Teste de debug"); // Used for detailed log
logger.info("Teste de info");

// Global variables
let file = fs.readFileSync("./pl00_075.fcv");

// .FCV file structure
let maxFrames = file.readUint16LE(0x00);
let nodeCount = file.readUint8(0x02);
let animationType = file.readUint8(0x03);
let dataType = file.readUint8(0x04);
let nodeID = file.readUint8(0x06 + (2 * nodeCount));

let dataTypes = {
   // Values are inverted just for swapping data, example 4-2-2 is 2-2-4
   0: ["readFloatLE", "readFloatLE", "readFloatLE", 2, 6, 10, 12], // 4-4-4 for 0x00
   1: ["readUint16LE", "readUint16LE", "readFloatLE", 2, 4, 6, 8], // 4-2-2 for 0x10 
   2: ["readUint8", "readUint8", "readFloatLE", 2, 3, 4, 6],       // 4-1-1 for 0x20
   3: ["readFloatLE", "readFloatLE", "readUint16LE", 2, 4, 8, 10], // 2-4-4 for 0x40
   4: ["readUint16LE", "readUint16LE", "readUint16LE", 2, 4, 6, 6],// 2-2-2 for 0x50
   5: ["readUint8", "readUint8", "readUint16LE", 2, 3, 4, 4],      // 2-1-1 for 0x60
   6: ["readUint16LE", "readUint16LE", "readUint8", 2, 4, 6, 5],   // 1-2-2 for 0x90
   7: ["readUint8", "readUint8", "readUint8", 2, 3, 4, 3],         // 1-1-1 for 0xA0
}

// READ .FCV FILE HEADER DATA
let arrayTypes = [];
let nodeList = [];
let arrayPointers = [];

function readAnimationTypes() {
   for (let i = 0; i < nodeCount * 2; i++) {
      let byte = file.readUint8(0x03 + i);
      arrayTypes.push(byte);
   }
};

function readNodes() {
   for (let i = 0; i < nodeCount; i++) {
      let node = file.readUint8(0x03 + arrayTypes.length + i)
      nodeList.push(node)
   }
};

function readPointers() {
   let pointerIterator = 0;
   for (let i = 0; i < nodeCount; i++) {
      let pointer = file.readUint32LE(0x03 + arrayTypes.length + nodeList.length + 0x04 + pointerIterator); // 0x04 is the file size uint32 value
      arrayPointers.push(pointer);
      pointerIterator += 4;
   }
};

readAnimationTypes();
readNodes();
readPointers();

// ----------------------------------
// READ .FCV FILE MOTION X-Y-Z DATA
let dataStartOffset = 0x03 + arrayTypes.length + nodeList.length + 0x04 + arrayPointers.length * 4;
let fcvData = file.subarray(dataStartOffset); // Splits the file from header to XYZ data
let tableX = []; // Stores all 3 column values for X
let tableY = []; // Stores all 3 column values for Y
let tableZ = []; // Stores all 3 column values for Z
let bytesRead = 0;
let framesRead = 0;
let padding0x02 = 0; // Adds two bytes of padding to ignore frame count uint16 value
let typeIterator = 0;

// Variables used for verification of bone type
let dataTypeLE1 = ''; // First column type
let dataTypeLE2 = ''; // Second column type
let dataTypeLE3 = ''; // Third column type
let data1 = 0; // Read first column data
let data2 = 0; // Read second column data
let data3 = 0; // Read third column data
let dataIterator = 0; // Iterates through each row (viewed in Crzosk's tool)

function swapData() {

   for (let bone = 0; bone < nodeList.length; bone++) {

      // 4:4:4 data type
      if (arrayTypes.at(1 + (2 * bone)) == 0x00) {
         dataTypeLE1 = dataTypes[0][0]; dataTypeLE2 = dataTypes[0][1]; dataTypeLE3 = dataTypes[0][2];
         data1 = dataTypes[0][3]; data2 = dataTypes[0][4]; data3 = dataTypes[0][5];
         dataIterator = dataTypes[0][6];
      }
      // 4:2:2 data type
      if (arrayTypes.at(1 + (2 * bone)) == 0x10) {
         dataTypeLE1 = dataTypes[1][0]; dataTypeLE2 = dataTypes[1][1]; dataTypeLE3 = dataTypes[1][2];
         data1 = dataTypes[1][3]; data2 = dataTypes[1][4]; data3 = dataTypes[1][5];
         dataIterator = dataTypes[1][6];
      }
      // 4:1:1 data type
      if (arrayTypes.at(1 + (2 * bone)) == 0x20) {
         dataTypeLE1 = dataTypes[2][0]; dataTypeLE2 = dataTypes[2][1]; dataTypeLE3 = dataTypes[2][2];
         data1 = dataTypes[2][3]; data2 = dataTypes[2][4]; data3 = dataTypes[2][5];
         dataIterator = dataTypes[2][6];
      }
      // 2:4:4 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x40 && arrayTypes.at(1 + (2 * bone)) < 0x50) {
         dataTypeLE1 = dataTypes[3][0]; dataTypeLE2 = dataTypes[3][1]; dataTypeLE3 = dataTypes[3][2];
         data1 = dataTypes[3][3]; data2 = dataTypes[3][4]; data3 = dataTypes[3][5];
         dataIterator = dataTypes[3][6];
      }
      // 2:2:2 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x50 && arrayTypes.at(1 + (2 * bone)) < 0x60) {
         dataTypeLE1 = dataTypes[4][0]; dataTypeLE2 = dataTypes[4][1]; dataTypeLE3 = dataTypes[4][2];
         data1 = dataTypes[4][3]; data2 = dataTypes[4][4]; data3 = dataTypes[4][5];
         dataIterator = dataTypes[4][6];
      }
      // 1:1:1 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0xA0 && arrayTypes.at(1 + (2 * bone)) < 0xB0) {
         dataTypeLE1 = dataTypes[7][0]; dataTypeLE2 = dataTypes[7][1]; dataTypeLE3 = dataTypes[7][2];
         data1 = dataTypes[7][3]; data2 = dataTypes[7][4]; data3 = dataTypes[7][5];
         dataIterator = dataTypes[7][6];
      }
      // 1:2:2 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x90 && arrayTypes.at(1 + (2 * bone)) < 0xA0) {
         dataTypeLE1 = dataTypes[6][0]; dataTypeLE2 = dataTypes[6][1]; dataTypeLE3 = dataTypes[6][2];
         data1 = dataTypes[6][3]; data2 = dataTypes[6][4]; data3 = dataTypes[6][5];
         dataIterator = dataTypes[6][6];
      }
      // 1:1:1 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0xA0 && arrayTypes.at(1 + (2 * bone)) < 0xB0) {
         dataTypeLE1 = dataTypes[7][0]; dataTypeLE2 = dataTypes[7][1]; dataTypeLE3 = dataTypes[7][2];
         data1 = dataTypes[7][3]; data2 = dataTypes[7][4]; data3 = dataTypes[7][5];
         dataIterator = dataTypes[7][6];
      }
      console.log(`Getting data from bone ${bone - 1} and type: 0x${arrayTypes.at(1 + (2 * bone)).toString(16)}`);
      console.log("Expecting to read offset: " + (arrayPointers[bone]).toString(16));

      // Loop for reading each Dataset (X, Y, Z)
      for (let dataSet = 0; dataSet < 3; dataSet++) {
         let frameCount = file.readUint16LE(arrayPointers[bone] + bytesRead + framesRead + padding0x02);
         typeIterator = 0;
         console.log("Frames found: " + frameCount + ", at offset: " + (arrayPointers[bone] + bytesRead + framesRead + padding0x02).toString(16));
         framesRead += (frameCount * 2);

         for (let j = 0; j < frameCount; j++) {
            let float1 = file[dataTypeLE1](arrayPointers[bone] + data1 + typeIterator + bytesRead + framesRead + padding0x02).toFixed(5);
            let float2 = file[dataTypeLE2](arrayPointers[bone] + data2 + typeIterator + bytesRead + framesRead + padding0x02).toFixed(5);
            let float3 = file[dataTypeLE3](arrayPointers[bone] + data3 + typeIterator + bytesRead + framesRead + padding0x02).toFixed(5);
            if (dataSet == 0) { tableX.push([float1], [float2], [float3]); }
            if (dataSet == 1) { tableY.push([float1], [float2], [float3]); }
            if (dataSet == 2) { tableZ.push([float1], [float2], [float3]); }
            console.log("Reading offset: " + (arrayPointers[bone] + 0x02 + typeIterator + bytesRead + framesRead + padding0x02).toString(16));
            typeIterator, bytesRead += dataIterator;

         }
         padding0x02 = padding0x02 + 0x02;
         console.log("");

         // Swapping the XYZ data
         // for (let dataSet = 0; dataSet < 2; dataSet++) {
         //    let fields = [tableX.length, tableY.length, tableZ.length];
         //    let bytesFromX = 12 * (tableX.length / 3);
         //    let framesX = ((tableX.length / 3) * 2) + 2;

         //    if (dataSet == 0) {
         //       for (let field = 0; field < fields[dataSet]; field++) {
         //          file.writeFloatLE(tableX.at(field), arrayPointers[bone] + ((fields[dataSet] / 3) * 2) + 0x02);
         //       }
         //    } else if (dataSet == 1) {
         //       for (let field = 0; field < fields[dataSet]; field++) {

         //          // TABLE.at field para consertar, ele está pegando valor errado no array
         //          // console.log((arrayPointers[bone] + ((fields[dataSet] / 3) * 2) + 0x02 + bytesFromX).toString(16));
         //          file.writeFloatLE(tableY.at(field + 2), arrayPointers[bone] + ((fields[dataSet] / 3) * 2) + 0x02 + bytesFromX + framesX + typeIterator);
         //          file.writeFloatLE(tableY.at(field), arrayPointers[bone] + ((fields[dataSet] / 3) * 2) + 0x0A + bytesFromX + framesX + typeIterator);
         //          typeIterator += 12;
         //       }
         //    } else {
         //       for (let field = 0; field < fields[dataSet]; field++) {
         //          file.writeFloatLE(tableY.at(field), arrayPointers[bone] + ((fields[dataSet] / 3) * 2) + 0x02 + bytesFromX);
         //       }
         //    }
         // }
      }
      console.log(tableX); console.log(tableY); console.log(tableZ);
      console.log("================================================");

      bytesRead = 0;
      framesRead = 0;
      padding0x02 = 0;

      // ===============================================================================
      // Writes the three column of X data 
      // for (let i = 0; i < frameCount; i++) {
      //     let typeIterator = 0;
      //     // 4:4:4 data type
      //     if (arrayTypes.at(1 + (2 * bone)) == 0x00) {

      //         // Writes X columns
      //         for (let j = 0; j < frameCount; j++) {
      //             file.writeFloatLE(tableX.at(j), arrayPointers[bone] + 0x02 + framesX + typeIterator);
      //             file.writeFloatLE(tableX.at(j + 1), arrayPointers[bone] + 0x06 + framesX + typeIterator);
      //             file.writeFloatLE(tableX.at(j + 2), arrayPointers[bone] + 0x0A + framesX + typeIterator);
      //             typeIterator += 12;
      //         }
      //         typeIterator = 0;

      //         // Writes Y columns
      //         for (let j = 0; j < frameCount; j++) {
      //             file.writeFloatLE(tableY.at(j), arrayPointers[bone] + 0x02 + framesX + typeIterator);
      //             file.writeFloatLE(tableY.at(j + 1), arrayPointers[bone] + 0x06 + framesX + typeIterator);
      //             file.writeFloatLE(tableY.at(j + 2), arrayPointers[bone] + 0x0A + framesX + typeIterator);
      //             typeIterator += 12;
      //         }
      //     }

      //     // 4:2:2 data type
      //     // if (arrayTypes.at(1 + (2 * bone)) == 0x10) {

      //     //     // Writes First column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeFloatLE(tableX.at((frameCount * 2) + j) * 100, arrayPointers[bone] + 0x02 + framesX + typeIterator);
      //     //         typeIterator += 8;
      //     //     }
      //     //     typeIterator = 0;

      //     //     // Writes Third column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeUint16LE(tableX.at(j), arrayPointers[bone] + 0x08 + framesX + typeIterator);
      //     //         typeIterator += 8;
      //     //     }
      //     //     typeIterator = 0;
      //     // }

      //     // 4:1:1 data type
      //     // if (arrayTypes.at(1 + (2 * bone)) == 0x20) {

      //     //     // Writes First column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeFloatLE(tableX.at((frameCount * 2) + j) * 100, arrayPointers[bone] + 0x02 + framesX + typeIterator);
      //     //         typeIterator += 6;
      //     //     }
      //     //     typeIterator = 0;

      //     //     // Writes Third column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeUint8(tableX.at(j), arrayPointers[bone] + 0x06 + framesX + typeIterator);
      //     //         typeIterator += 6;
      //     //     }
      //     //     typeIterator = 0;
      //     // }

      //     // 2:4:4 data type
      //     // if (arrayTypes.at(1 + (2 * bone)) >= 0x40 && arrayTypes.at(1 + (2 * bone)) < 0x50) {

      //     //     // Writes First column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeUint16LE(tableX.at((frameCount * 2) + j), arrayPointers[bone] + 0x02 + framesX + typeIterator);
      //     //         typeIterator += 10;
      //     //     }
      //     //     typeIterator = 0;

      //     //     // Writes Third column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeFloatLE(tableX.at(j), arrayPointers[bone] + 0x08 + framesX + typeIterator);
      //     //         typeIterator += 10;
      //     //     }
      //     //     typeIterator = 0;
      //     // }

      //     // 2:2:2 data type
      //     // if (arrayTypes.at(1 + (2 * bone)) >= 0x50 && arrayTypes.at(1 + (2 * bone)) < 0x60) {

      //     //     // Writes First column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeUint16LE(tableX.at((frameCount * 2) + j), arrayPointers[bone] + 0x02 + framesX + typeIterator);
      //     //         typeIterator += 6;
      //     //     }
      //     //     typeIterator = 0;

      //     //     // Writes Third column
      //     //     for (let j = 0; j < frameCount; j++) {
      //     //         file.writeUint16LE(tableX.at(j), arrayPointers[bone] + 0x06 + framesX + typeIterator);
      //     //         typeIterator += 6;
      //     //     }
      //     //     typeIterator = 0;
      //     // }
      // }
      tableX = [];
      tableY = [];
      tableZ = [];
      arrayFrames = [];
   }
};
swapData();
fs.writeFileSync("test.fcv", file);

// Prevents the script from auto-closing
// require('child_process').spawnSync("pause", { shell: true, stdio: [0, 1, 2] });