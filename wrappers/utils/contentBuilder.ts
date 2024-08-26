import { Dictionary, beginCell, Cell } from '@ton/core';
import { sha256_sync } from '@ton/crypto'

export function toSha256(s: string): bigint {
    return BigInt('0x' + sha256_sync(s).toString('hex'))
}

export function toTextCell(s: string): Cell {
    return beginCell().storeUint(0, 8).storeStringTail(s).endCell()
}

export function buildMasterContentCell(uri: string): Cell {
    const masterContentDict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
        .set(toSha256("uri"), toTextCell(uri))
    return beginCell() // need to fix 
        .storeUint(0,8)
        .storeDict(masterContentDict)
        .endCell(); 
}