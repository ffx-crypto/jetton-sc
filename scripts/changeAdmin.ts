import { address } from '@ton/core';
import { jettonContentToCell,JettonMinterSale } from '../wrappers/JettonMinterSale';
import { NetworkProvider, compile } from '@ton/blueprint';
import * as dotenv from 'dotenv';
dotenv.config();


export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    // GET NEW ADMIN ADDRESS
    const newAdminAddress = await ui.input('Provide new admin address');
    const minterAddress = await ui.input('Provide JettonMinterSale address');
    const jettonMinter = provider.open(JettonMinterSale.createFromAddress(address(minterAddress)));
    // SEND MESSAGE WITH CHANGE ADMIN OPCODE
    await jettonMinter.sendChangeAdmin(provider.sender(), address(newAdminAddress));

    ui.write('Successfully upgraded minter contract.');
}