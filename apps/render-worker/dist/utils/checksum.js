"use strict";
/**
 * Checksum utility for file integrity verification
 * Used in OCR transition to verify file integrity after download
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateSHA256 = calculateSHA256;
const crypto_1 = __importDefault(require("crypto"));
async function calculateSHA256(data) {
    let buffer;
    if (data instanceof Buffer) {
        buffer = data;
    }
    else if (data instanceof ArrayBuffer) {
        buffer = Buffer.from(data);
    }
    else {
        // Blob - check if it has arrayBuffer method
        if ('arrayBuffer' in data && typeof data.arrayBuffer === 'function') {
            buffer = Buffer.from(await data.arrayBuffer());
        }
        else {
            throw new Error('Unsupported data type for checksum calculation');
        }
    }
    return crypto_1.default
        .createHash('sha256')
        .update(buffer)
        .digest('hex');
}
//# sourceMappingURL=checksum.js.map