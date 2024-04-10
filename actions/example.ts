import {
	ActionFn,
	Context,
	Event,
	Network,
} from '@tenderly/actions';

import { ethers } from 'ethers';
import axios from 'axios';

import MocaTokenAbi from './MocaTokenAbi.json';
import MocaOftAbi from './MocaOftAbi.json';

const MOCA_TOKEN_ADDRESS = "0x7C5FCc377D2116a8eA94Ea527774a324E73D185B";
const MOCA_TOKEN_ADAPTER_ADDRESS = "0x73ff46a2F756276269B2a2630C6288623d9c1bc9";
const MOCA_OFT_ADDRESS = "0x45e8c7B75ba86a27562eE3760011c4adC36C076b";

export const tracker: ActionFn = async (context: Context, event: Event) => {
	const gatewaySepolia = context.gateways.getGateway(Network.SEPOLIA);
	const gatewayMumbai = context.gateways.getGateway(Network.MUMBAI);
  	
	// Using the Ethers.js provider class to call the RPC URL
  	const rpcSepolia = new ethers.JsonRpcProvider(gatewaySepolia);
  	const rpcMumbai = new ethers.JsonRpcProvider(gatewayMumbai);

	// Instantiate MocaToken contract
	const mocaTokenContract = new ethers.Contract(MOCA_TOKEN_ADDRESS, MocaTokenAbi, rpcSepolia);

	// Call balanceOf function
	const adapterBalance = await mocaTokenContract.balanceOf(MOCA_TOKEN_ADAPTER_ADDRESS);
	console.log('Adapter Balance:', adapterBalance.toString());

    // Instantiate MocaOFT contract
		// Obtain the private key from context.secrets.get("oracle.addressPrivateKey")
		const privateKey = await context.secrets.get("monitor.privateKey");
		const signer = new ethers.Wallet(privateKey, rpcMumbai);
    const mocaOftContract = new ethers.Contract(MOCA_OFT_ADDRESS, MocaOftAbi, signer);
   
    // Call totalSupply on OFT
    const oftBalance = await mocaOftContract.totalSupply();
    console.log('OFT Balance:', oftBalance.toString());

	if(adapterBalance != oftBalance) {

		const delta = BigInt(adapterBalance.toString()) - BigInt(oftBalance.toString());
		const deltaTokens = parseFloat(delta.toString()) / 1e18; 

		//break bridge
		const message = 
			`Adapter Balance: ${adapterBalance}
			 OFT Balance: ${oftBalance}
			 Delta: ${delta}
			 DeltaTokens: ${deltaTokens}`;

		await notifyTelegram(message, context);

		// trigger sendTransaction function
		const hash = await sendTransaction(context, mocaOftContract);
		console.log('Polygon txn hash:', hash.toString());
		
		const hashMessage = 
			`resetPeer() called successfully on Polygon.\n
		https://mumbai.polygonscan.com/tx/${hash.toString()}\n`;
		
		await notifyTelegram(hashMessage, context);

	} else {

		await notifyTelegram('Balances are equal', context);

		console.log('Balances are equal');
	}
}

async function sendTransaction(context: Context, mocaOftContract: ethers.Contract) {

	// break bridge from polygon side: polgyon cheaper
	const homeChainID = 40161;		// sepolia chainId
	
	const txn = await mocaOftContract.resetPeer(homeChainID);	
	console.log('Transaction created');

	// wait for block
	const receipt = await txn.wait(1);
	console.log('Transaction receipt:', receipt);

	return receipt.hash;
}

const notifyTelegram = async (text: string, context: Context) => {

    console.log('Sending to Telegram:', text);

	const botToken = await context.secrets.get("MocaMonitorBotToken");
    const chatId = await context.secrets.get("telegram.channelId");

    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        await axios.post(apiUrl, {
            chat_id: chatId,
            text: text,
        });
        console.log('Message sent successfully to Telegram');

    } catch (error) {

        console.error('Error sending message to Telegram:', error);
    }
};

/*
import * as TelegramBot from 'node-telegram-bot-api';

// works as well
const sendTgMessage = async (message: string, context: Context) => {

	try {
		
		const botToken = await context.secrets.get("MocaMonitorBotToken");

		const bot = new TelegramBot(botToken);
	  	await bot.sendMessage(-1002126569884, message);
	  	console.log('Message sent to Telegram channel successfully!');

	} catch (error) {

		console.error('Error sending message to Telegram:', error);
	}
};

const notifyDiscord = async (text: string, context: Context) => {

	console.log('Sending to Discord:', `🐥 ${text}`)

	const webhookLink = await context.secrets.get("discord.uniswapChannelWebhook");
	await axios.post(
		webhookLink,
		{
			'content': `🐥 ${text}`
		},
		{
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			}
		}
	);
}

*/