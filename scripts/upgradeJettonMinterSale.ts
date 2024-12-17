import { Address, address, toNano } from '@ton/core';
import { JettonMinterSale } from '../wrappers/JettonMinterSale';
import { NetworkProvider, compile } from '@ton/blueprint';
import * as dotenv from 'dotenv';
dotenv.config();


export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const newMinterCode = await compile('JettonMinter');

    const minterAddress = await ui.input('Provide JettonMinterSale address');
    const jettonMinter = provider.open(JettonMinterSale.createFromAddress(address(minterAddress)));

    await jettonMinter.sendUpgradeMessage(provider.sender(), newMinterCode);

    ui.write('Successfully upgraded minter contract.');
}