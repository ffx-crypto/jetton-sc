import { Address, address, toNano } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import { NetworkProvider } from '@ton/blueprint';


export async function run(provider: NetworkProvider) {
    const ui = provider.ui();

    const minterAddress = await ui.input('Provide Minter address');
    const jettonAmountStr = await ui.input('Provide amount of jettons to mint');
    const jettonAmount = Number(jettonAmountStr);

    if (isNaN(jettonAmount)) {
        throw new Error('Invalid input: entered value is not a number');
    }
    
    const jettonMinter = provider.open(JettonMinter.createFromAddress(address(minterAddress)));
    // mint fees = 0.006957432
    await jettonMinter.sendMint(provider.sender(), 
        provider.sender().address as Address, // to address
        toNano(jettonAmount), 
        1n, // forward ton amount
        toNano('0.05') // total ton amount
    );

    ui.write('Minted successfully!');
}