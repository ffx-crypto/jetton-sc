import { address } from '@ton/core';
import { jettonContentToCell,JettonMinterSale } from '../wrappers/JettonMinterSale';
import { NetworkProvider, compile } from '@ton/blueprint';
import * as dotenv from 'dotenv';
dotenv.config();


export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    // GET NEW CONTET URI AND CREATE CELL
    const newContentUrl = await ui.input('Provide new content url');
    const newContent = jettonContentToCell({type: 1, uri: newContentUrl });
    // GET MINTER ADDRESS AND CREATE MINTER WRAPPER 
    const minterAddress = await ui.input('Provide JettonMinterSale address');
    const jettonMinter = provider.open(JettonMinterSale.createFromAddress(address(minterAddress)));

    await jettonMinter.sendChangeContentMessage(provider.sender(), newContent);

    ui.write('Successfully upgraded minter contract.');
}