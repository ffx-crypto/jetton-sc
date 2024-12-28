import { Address, address, toNano } from '@ton/core';
import { JettonMinterSale } from '../wrappers/JettonMinterSale';
import { NetworkProvider, sleep } from '@ton/blueprint';
import * as dotenv from 'dotenv';
dotenv.config();


export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const minterAddress = await ui.input('Provide Minter address');
    const jettonMinter = provider.open(JettonMinterSale.createFromAddress(address(minterAddress)));
    // operation fees = 0.00498
    await jettonMinter.sendDestroy(provider.sender());

    ui.write('Successfully closed minter contract.');
}