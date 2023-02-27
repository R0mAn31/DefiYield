const axios = require('axios');
const express = require('express');
const Web3 = require('web3');
const fs = require('fs');
const abi = require('./abi.json');
const config = require(`./config.json`);

const app = express();

app.get('/balances/:address', async (req, res) => {
    getTokensList();
    const address = req.params.address;
    const erc20Tokens = readJSONFromFile(config.filePath);
    const balances = await getTokensBalances(address, erc20Tokens);
    await new Promise(getTokensBalances => setTimeout(getTokensBalances, 60000));
    res.json(balances);
});

const getTokensBalances = async (address, data) => {
    const erc20Tokens = data;
    const web3 = new Web3(`https://mainnet.infura.io/v3/${config.infuraID}`);
    const balances = {};
    const contractCache = {};

    try {
        const ethereumBalance = await web3.eth.getBalance(address);
        //console.log(`Balance of ETH: ${web3.utils.fromWei(ethereumBalance, 'ether')}`);
        balances["ETH"] = Number(web3.utils.fromWei(ethereumBalance, 'ether'));
    } catch (error) {
        //console.log(`Error getting ETH balance: ${error.message}`);
    }

    const promises = erc20Tokens.map(async (token) => {
        const tokenAddress = token.ethereumAddress;
        let tokenContract = contractCache[tokenAddress];
        if (!tokenContract) {
            tokenContract = new web3.eth.Contract(abi, tokenAddress);
            contractCache[tokenAddress] = tokenContract;
        }
        try {
            const decimals = await tokenContract.methods.decimals().call();
            const balance = await tokenContract.methods.balanceOf(address).call();
            if (balance / 10 ** decimals >= 0.000001) {
                const balanceInTokens = balance / 10 ** decimals;
                balances[token.name] = balanceInTokens;
            }
        } catch (error) {
            //console.log(`Error getting balance for token ${token.name}: ${error.message}`);
        }
    });

    await Promise.all(promises);

    const latestBalance = { time: new Date().toLocaleTimeString(), balance: balances };
    writeJSONToFile(latestBalance, config.latestBalanceFilePath);

    return balances;
};

const readJSONFromFile = (filename) => {
    try {
        const data = fs.readFileSync(filename);
        return JSON.parse(data);
    } catch (err) {
        console.error('Failed:', err);
        return null;
    }
}

const getCoinList = async () => {
    const url = 'https://api.coingecko.com/api/v3/coins/list?include_platform=true';
    const response = await axios.get(url);
    return response.data;
};

const isErc20Token = (coin) => {
    if (coin.platforms.hasOwnProperty(`ethereum`)) {
        if (coin.platforms.ethereum === "")
            return false
        else
            return true;
    } else {
        return false;
    }

};

const getErc20Tokens = (coins) => {
    return coins.filter(isErc20Token);
};

function writeJSONToFile(data, filename) {
    fs.writeFile(filename, JSON.stringify(data), function (error) {
        if (error) {
            console.error('Failed writing to file', error);
            return;
        }
        console.log('Sucessfull', filename);
    });
}

const getTokensList = async () => {
    // parse tokens in json
    if (fs.existsSync(config.filePath)) {
        console.log('File with list of tokens exists');
    } else {
        const coins = await getCoinList();
        const erc20Tokens = getErc20Tokens(coins);
        console.log('ERC-20 tokens:', erc20Tokens);
        const filteredTokens = erc20Tokens.map(token => {
            return {
                name: token.name,
                symbol: token.symbol,
                ethereumAddress: token.platforms.ethereum
            }
        });
        writeJSONToFile(filteredTokens, "tokens.json")
    }
};

app.listen(3000, () => {
    console.log('Server listening on port 3000');
});
