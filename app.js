// Required modules
const fs = require('fs');
const log4js = require("log4js");
let logLevel = 'info';

// Executable arguments
let fcvFile = process.argv[2];
if (process.argv[3] == "-debug") {
   console.log("Extra argument received: debug");
   logLevel = "debug";
};

// Configuration for simple and debug logs
log4js.configure({
   appenders: {
      everything: { type: 'file', filename: 'log.txt', flags: 'w', layout: { type: "messagePassThrough" } }
   },
   categories: { default: { appenders: ['everything'], level: logLevel } }
});

let logger = log4js.getLogger();
logger.debug(); // Used for detailed log
logger.info(); // Used for simple log

// Global variables
let file = fs.readFileSync(fcvFile);
let numberDivisibleBy4 = 0;

// .FCV file structure
let maxFrames = file.readUint16LE(0x00);
let nodeCount = file.readUint8(0x02);
let animationType = file.readUint8(0x03);
let dataType = file.readUint8(0x04);
let nodeID = file.readUint8(0x06 + (2 * nodeCount));

let dataTypes = {
   // Values are inverted just for swapping data, example 4-2-2 is 2-2-4
   0: ["readFloatLE", "readFloatLE", "readFloatLE", 2, 6, 10, 12],  // 4-4-4 for 0x00
   1: ["readUint16LE", "readUint16LE", "readFloatLE", 2, 4, 6, 8],  // 4-2-2 for 0x10 
   2: ["readUint8", "readUint8", "readFloatLE", 2, 3, 4, 6],        // 4-1-1 for 0x20
   3: ["readFloatLE", "readFloatLE", "readUint16LE", 2, 6, 10, 10], // 2-4-4 for 0x40
   4: ["readUint16LE", "readUint16LE", "readUint16LE", 2, 4, 6, 6], // 2-2-2 for 0x50
   5: ["readUint8", "readUint8", "readUint16LE", 2, 3, 4, 4],       // 2-1-1 for 0x60
   6: ["readUint16LE", "readUint16LE", "readUint8", 2, 4, 6, 5],    // 1-2-2 for 0x90
   7: ["readUint8", "readUint8", "readUint8", 2, 3, 4, 3],          // 1-1-1 for 0xA0
}

let writeDataTypes = {
   // Values are not inverted 
   0: ["writeFloatLE", "writeFloatLE", "writeFloatLE", 2, 6, 10, 12],  // 4-4-4 for 0x00
   1: ["writeFloatLE", "writeUint16LE", "writeUint16LE", 2, 6, 8, 8],  // 4-2-2 for 0x10 
   2: ["writeFloatLE", "writeUint8", "writeUint8", 2, 6, 7, 6],        // 4-1-1 for 0x20
   3: ["writeUint16LE", "writeFloatLE", "writeFloatLE", 2, 4, 8, 10],  // 2-4-4 for 0x40
   4: ["writeUint16LE", "writeUint16LE", "writeUint16LE", 2, 4, 6, 6], // 2-2-2 for 0x50
   5: ["writeUint16LE", "writeUint8", "writeUint8", 2, 4, 5, 4],       // 2-1-1 for 0x60
   6: ["writeUint8", "writeUint16LE", "writeUint16LE", 2, 3, 5, 5],    // 1-2-2 for 0x90
   7: ["writeUint8", "writeUint8", "writeUint8", 2, 3, 4, 3],          // 1-1-1 for 0xA0
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

readAnimationTypes();
readNodes();

// Verify if padding is needed after bone list
for (let n = 0; n < 3; n++) {
   if (file.readUint32LE(numberDivisibleBy4 + arrayTypes.length + nodeList.length + 0x03) != file.length) {
      numberDivisibleBy4++;
   }
}

function readPointers() {
   let pointerIterator = 0;
   for (let i = 0; i < nodeCount; i++) {
      let pointer = file.readUint32LE(numberDivisibleBy4 + 0x03 + arrayTypes.length + nodeList.length + pointerIterator + 0x04); // 0x04 is the file size uint32 value
      arrayPointers.push(pointer);
      pointerIterator += 4;
   }
};

readPointers();

// ----------------------------------
// READ .FCV FILE MOTION X-Y-Z DATA
let dataStartOffset = 0x03 + arrayTypes.length + nodeList.length + 0x04 + arrayPointers.length * 4;
let fcvData = file.subarray(dataStartOffset); // Splits the file from header to XYZ data
let tableX = []; // Stores all 3 column values for X
let tableY = []; // Stores all 3 column values for Y
let tableZ = []; // Stores all 3 column values for Z
let bytesRead = 0;
let writeBytesRead = 0;
let framesRead = 0;
let padding0x02 = 0; // Adds two bytes of padding to ignore frame count uint16 value
let typeIterator = 0;
let writeTypeIterator = 0;

// Variables used for verification of bone type
let dataTypeLE1 = ''; // Read First column type
let dataTypeLE2 = ''; // Read Second column type
let dataTypeLE3 = ''; // Read Third column type
let data1 = 0; // Read first column data   -> o-x-x
let data2 = 0; // Read second column data  -> x-o-x
let data3 = 0; // Read third column data   -> x-x-o
let dataIterator = 0; // Iterates through each row (viewed in Crzosk's tool)

// Variables used to rewrite data on each XYZ data set
let writeDataTypeLE1 = ''; // Write First column type
let writeDataTypeLE2 = ''; // Write Second column type
let writeDataTypeLE3 = ''; // Write Third column type
let writeData1 = 0; // Write first column data   -> o-x-x
let writeData2 = 0; // Write second column data  -> x-o-x
let writeData3 = 0; // Write third column data   -> x-x-o
let writeDataIterator = 0; // Iterates through each row (viewed in Crzosk's tool)

function swapData() {

   for (let bone = 0; bone < nodeList.length; bone++) {

      // 4:4:4 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x00 && arrayTypes.at(1 + (2 * bone)) < 0x10) {
         dataTypeLE1 = dataTypes[0][0]; dataTypeLE2 = dataTypes[0][1]; dataTypeLE3 = dataTypes[0][2];
         data1 = dataTypes[0][3]; data2 = dataTypes[0][4]; data3 = dataTypes[0][5];
         dataIterator = dataTypes[0][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[0][0]; writeDataTypeLE2 = writeDataTypes[0][1]; writeDataTypeLE3 = writeDataTypes[0][2];
         writeData1 = writeDataTypes[0][3]; writeData2 = writeDataTypes[0][4]; writeData3 = writeDataTypes[0][5];
         writeDataIterator = writeDataTypes[0][6];
      }
      // 4:2:2 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x10 && arrayTypes.at(1 + (2 * bone)) < 0x20) {
         dataTypeLE1 = dataTypes[1][0]; dataTypeLE2 = dataTypes[1][1]; dataTypeLE3 = dataTypes[1][2];
         data1 = dataTypes[1][3]; data2 = dataTypes[1][4]; data3 = dataTypes[1][5];
         dataIterator = dataTypes[1][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[1][0]; writeDataTypeLE2 = writeDataTypes[1][1]; writeDataTypeLE3 = writeDataTypes[1][2];
         writeData1 = writeDataTypes[1][3]; writeData2 = writeDataTypes[1][4]; writeData3 = writeDataTypes[1][5];
         writeDataIterator = writeDataTypes[1][6];
      }
      // 4:1:1 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x20 && arrayTypes.at(1 + (2 * bone)) < 0x30) {
         dataTypeLE1 = dataTypes[2][0]; dataTypeLE2 = dataTypes[2][1]; dataTypeLE3 = dataTypes[2][2];
         data1 = dataTypes[2][3]; data2 = dataTypes[2][4]; data3 = dataTypes[2][5];
         dataIterator = dataTypes[2][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[2][0]; writeDataTypeLE2 = writeDataTypes[2][1]; writeDataTypeLE3 = writeDataTypes[2][2];
         writeData1 = writeDataTypes[2][3]; writeData2 = writeDataTypes[2][4]; writeData3 = writeDataTypes[2][5];
         writeDataIterator = writeDataTypes[2][6];
      }
      // 2:4:4 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x40 && arrayTypes.at(1 + (2 * bone)) < 0x50) {
         dataTypeLE1 = dataTypes[3][0]; dataTypeLE2 = dataTypes[3][1]; dataTypeLE3 = dataTypes[3][2];
         data1 = dataTypes[3][3]; data2 = dataTypes[3][4]; data3 = dataTypes[3][5];
         dataIterator = dataTypes[3][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[3][0]; writeDataTypeLE2 = writeDataTypes[3][1]; writeDataTypeLE3 = writeDataTypes[3][2];
         writeData1 = writeDataTypes[3][3]; writeData2 = writeDataTypes[3][4]; writeData3 = writeDataTypes[3][5];
         writeDataIterator = writeDataTypes[3][6];
      }
      // 2:2:2 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x50 && arrayTypes.at(1 + (2 * bone)) < 0x60) {
         dataTypeLE1 = dataTypes[4][0]; dataTypeLE2 = dataTypes[4][1]; dataTypeLE3 = dataTypes[4][2];
         data1 = dataTypes[4][3]; data2 = dataTypes[4][4]; data3 = dataTypes[4][5];
         dataIterator = dataTypes[4][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[4][0]; writeDataTypeLE2 = writeDataTypes[4][1]; writeDataTypeLE3 = writeDataTypes[4][2];
         writeData1 = writeDataTypes[4][3]; writeData2 = writeDataTypes[4][4]; writeData3 = writeDataTypes[4][5];
         writeDataIterator = writeDataTypes[4][6];
      }
      // 2:1:1 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x60 && arrayTypes.at(1 + (2 * bone)) < 0x70) {
         dataTypeLE1 = dataTypes[5][0]; dataTypeLE2 = dataTypes[5][1]; dataTypeLE3 = dataTypes[5][2];
         data1 = dataTypes[5][3]; data2 = dataTypes[5][4]; data3 = dataTypes[5][5];
         dataIterator = dataTypes[5][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[5][0]; writeDataTypeLE2 = writeDataTypes[5][1]; writeDataTypeLE3 = writeDataTypes[5][2];
         writeData1 = writeDataTypes[5][3]; writeData2 = writeDataTypes[5][4]; writeData3 = writeDataTypes[5][5];
         writeDataIterator = writeDataTypes[5][6];
      }
      // 1:2:2 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0x90 && arrayTypes.at(1 + (2 * bone)) < 0xA0) {
         dataTypeLE1 = dataTypes[6][0]; dataTypeLE2 = dataTypes[6][1]; dataTypeLE3 = dataTypes[6][2];
         data1 = dataTypes[6][3]; data2 = dataTypes[6][4]; data3 = dataTypes[6][5];
         dataIterator = dataTypes[6][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[6][0]; writeDataTypeLE2 = writeDataTypes[6][1]; writeDataTypeLE3 = writeDataTypes[6][2];
         writeData1 = writeDataTypes[6][3]; writeData2 = writeDataTypes[6][4]; writeData3 = writeDataTypes[6][5];
         writeDataIterator = writeDataTypes[6][6];
      }
      // 1:1:1 data type
      if (arrayTypes.at(1 + (2 * bone)) >= 0xA0 && arrayTypes.at(1 + (2 * bone)) < 0xB0) {
         dataTypeLE1 = dataTypes[7][0]; dataTypeLE2 = dataTypes[7][1]; dataTypeLE3 = dataTypes[7][2];
         data1 = dataTypes[7][3]; data2 = dataTypes[7][4]; data3 = dataTypes[7][5];
         dataIterator = dataTypes[7][6];
         // Write data
         writeDataTypeLE1 = writeDataTypes[7][0]; writeDataTypeLE2 = writeDataTypes[7][1]; writeDataTypeLE3 = writeDataTypes[7][2];
         writeData1 = writeDataTypes[7][3]; writeData2 = writeDataTypes[7][4]; writeData3 = writeDataTypes[7][5];
         writeDataIterator = writeDataTypes[7][6];
      }
      logger.info(`Getting data from bone ${nodeList[bone]} and type: 0x${arrayTypes.at(1 + (2 * bone)).toString(16)}`);
      logger.debug("Expecting to read offset: " + (arrayPointers[bone]).toString(16));

      // Loop for reading each Dataset (X, Y, Z)
      for (let dataSet = 0; dataSet < 3; dataSet++) {
         let frameCount = file.readUint16LE(arrayPointers[bone] + bytesRead + framesRead + padding0x02);
         typeIterator = 0;
         writeTypeIterator = 0;

         logger.info("Frames found: " + frameCount + ", at offset: " + (arrayPointers[bone] + bytesRead + framesRead + padding0x02).toString(16));
         framesRead += (frameCount * 2);
         for (let j = 0; j < frameCount; j++) {
            let float1 = file[dataTypeLE1](arrayPointers[bone] + data1 + typeIterator + bytesRead + framesRead + padding0x02).toFixed(5);
            let float2 = file[dataTypeLE2](arrayPointers[bone] + data2 + typeIterator + bytesRead + framesRead + padding0x02).toFixed(5);
            let float3 = file[dataTypeLE3](arrayPointers[bone] + data3 + typeIterator + bytesRead + framesRead + padding0x02).toFixed(5);
            if (dataSet == 0) { tableX.push([float1], [float2], [float3]); }
            if (dataSet == 1) { tableY.push([float1], [float2], [float3]); }
            if (dataSet == 2) { tableZ.push([float1], [float2], [float3]); }
            logger.debug("Reading offset: " + (arrayPointers[bone] + 0x02 + typeIterator + bytesRead + framesRead + padding0x02).toString(16));
            typeIterator, bytesRead += dataIterator;
         }

         logger.debug("");
         let tableIterator = 0;

         // Swapping the XYZ data
         for (let frame = 0; frame < frameCount; frame++) {
            if (dataSet == 0) {
               file[writeDataTypeLE3](tableX[0 + tableIterator], arrayPointers[bone] + writeData3 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
               file[writeDataTypeLE2](tableX[1 + tableIterator], arrayPointers[bone] + writeData2 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
               file[writeDataTypeLE1](tableX[2 + tableIterator], arrayPointers[bone] + writeData1 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
            } else if (dataSet == 1) {
               file[writeDataTypeLE3](tableY[0 + tableIterator], arrayPointers[bone] + writeData3 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
               file[writeDataTypeLE2](tableY[1 + tableIterator], arrayPointers[bone] + writeData2 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
               file[writeDataTypeLE1](tableY[2 + tableIterator], arrayPointers[bone] + writeData1 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
            } else {
               file[writeDataTypeLE3](tableZ[0 + tableIterator], arrayPointers[bone] + writeData3 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
               file[writeDataTypeLE2](tableZ[1 + tableIterator], arrayPointers[bone] + writeData2 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
               file[writeDataTypeLE1](tableZ[2 + tableIterator], arrayPointers[bone] + writeData1 + framesRead + writeBytesRead + padding0x02 + writeTypeIterator);
            }
            tableIterator += 3;
            writeTypeIterator, writeBytesRead += dataIterator;
         }
         padding0x02 = padding0x02 + 0x02;
      }
      logger.info(tableX); logger.info(tableY); logger.info(tableZ);
      logger.info("================================================");

      bytesRead = 0; writeBytesRead = 0;
      framesRead = 0; padding0x02 = 0;

      tableX = [];
      tableY = [];
      tableZ = [];
      arrayFrames = [];
   }
};
swapData();

// Updates file name-> pl; wep; em
let fixedFilename = '';
if (fcvFile.substring(0, 2) == "pl" || fcvFile.substring(0, 2) == "em") {
   let filetype = fcvFile.substring(0, 4);
   let fileNumber = fcvFile.substring(6, 9);
   fixedFilename = filetype + "_" + fileNumber;
} else if (fcvFile.substring(0, 3) == "wep") {
   let filetype = fcvFile.substring(0, 5);
   let fileNumber = fcvFile.substring(8, 10);
   fixedFilename = filetype + "_" + fileNumber;
   if (fixedFilename == "") { fixedFilename = "wep" }
}

fs.writeFileSync(`${fixedFilename}.fcv`, file);

// Prevents the script from auto-closing
// require('child_process').spawnSync("pause", { shell: true, stdio: [0, 1, 2] });