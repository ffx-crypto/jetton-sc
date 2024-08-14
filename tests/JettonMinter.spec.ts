import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('JettonMinter', () => {
    let minterCode: Cell;
    let jettonWalletCode: Cell;
    let masterContractContent: Cell;

    beforeAll(async () => {
        minterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let nonDeployer: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        nonDeployer = await blockchain.treasury('non-deployer');
        masterContractContent = beginCell().endCell();

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    admin: deployer.address!,
                    content: masterContractContent,
                    jwallet_code: jettonWalletCode,
                },
                minterCode,
            ),
        );

        deployer = await blockchain.treasury('deployer');

        const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });
    });
    
    it('should get jetton data after contract has been deployed', async () => {
        // the check is done inside beforeEach
        // blockchain and masterContract are ready to use
        const jetton_data = await jettonMinter.getJettonData();
        expect(jetton_data).toHaveProperty("totalSupply", 0n);
        expect(jetton_data).toHaveProperty("mintable", true);
        expect(jetton_data.adminAddress).toEqualAddress(deployer.address);
        expect(jetton_data.content).toEqualCell(masterContractContent);
        // parseJettonContent(jetton_data.content);
        // console.log("content", jetton_data.content);
        expect(jetton_data.walletCode).toEqualCell(jettonWalletCode);
    });

    it('should allow to admin to change admin', async () => {
        const new_owner = await blockchain.treasury('new_owner');
        const result = await jettonMinter.sendChangeAdmin(deployer.getSender(), new_owner.address);
        const new_minter_amdin = await jettonMinter.getAdminAddress();
        expect(new_minter_amdin).toEqualAddress(new_owner.address);
    });
    it('not a minter admin can not change admin', async () => {
        let changeAdmin = await jettonMinter.sendChangeAdmin(nonDeployer.getSender(), nonDeployer.address);
        expect((await jettonMinter.getAdminAddress()).equals(deployer.address)).toBe(true);
        expect(changeAdmin.transactions).toHaveTransaction({
            from: nonDeployer.address,
            to: jettonMinter.address,
            aborted: true,
            exitCode: 73, // error::unauthorized_change_admin_request
        });
    });

    it('admin should be able to mint jettons in the limit of max_prev_supply', async () => {
        // const JWalletAddr = blockchain.openContract(JettonWallet.createFromAddress(deployer.address));
        const initialTotalSupply = await jettonMinter.getTotalSupply();
        const JWalletAddress = await jettonMinter.getJettonWalletAddress(deployer.address);
        const jettonsAmountToMint = 4001n;
        const total_ton_amount = toNano('0.04');
        const mintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address, // to Address
            jettonsAmountToMint, // jetton amount
            toNano('0.01'), // forward ton amount
            toNano('0.04'), // total ton amount
        );
        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: JWalletAddress,
            deploy: true,
            value: total_ton_amount,
        });
        // console.log('mintResult ', mintResult.transactions);
        const newTotalSupply = await jettonMinter.getTotalSupply();
        expect(newTotalSupply).toBe(initialTotalSupply + jettonsAmountToMint);
        // ANOTHER MINT 
        const maxPossibleJettonAmount = 4288n - newTotalSupply;
        const secondMintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address, // to Address
            maxPossibleJettonAmount, // jetton amount
            toNano('0.01'), // forward ton amount
            toNano('0.04'), // total ton amount
        );
        expect(secondMintResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: JWalletAddress,
            deploy: false,
            value: total_ton_amount,
            success: true
        })
        // ADDITIONAL MINT ATTEMPT
        const additionalMintAttempt = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address,
            4000n,
            toNano('0.01'),
            toNano('0.04'),
        );
        expect(additionalMintAttempt.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            success: false,
            exitCode: 101,
        });
    });
    it('mintable status changes when max_prev_supply is achived', async () => {
        const max_prev_supply = 4288n;
        const contractData = await jettonMinter.getJettonData();
        expect(contractData.mintable).toBe(true);
        const firstMintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address, // to Address
            288n, // jetton amount
            toNano('0.01'), // forward ton amount
            toNano('0.04'),
        )
        const minterData = await jettonMinter.getJettonData();
        expect(minterData.mintable).toBe(true);
        const secondMintResult = await jettonMinter.sendMint(
            deployer.getSender(),
            deployer.address, // to Address
            (max_prev_supply - 288n), // jetton amount
            toNano('0.01'), // forward ton amount
            toNano('0.04'), // total ton amount
        );
        const newMinterData = await jettonMinter.getJettonData();
        expect(newMinterData.mintable).toBe(false);
    })
    
    it('not minter admin should not be able to mint jettons', async () => {
        const non_owner_wallet = await blockchain.treasury('non-owner');
        const jwallet_address = await jettonMinter.getWalletAddress(non_owner_wallet.address);

        const mintResult = await jettonMinter.sendMint(non_owner_wallet.getSender(),
            jwallet_address,
            BigInt(499),
            toNano('0.01'),
            toNano('0.04')
         );

        expect(mintResult.transactions).toHaveTransaction({
            from: non_owner_wallet.address,
            to: jettonMinter.address,
            success: false,
            exitCode: 73
        })
    })
    
});
