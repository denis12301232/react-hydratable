const fs = require('fs');
const puppeteer = require('puppeteer');
const { delay, iife, createDirs } = require('./utils');
const { URL } = require('url');

const crawlingOnePage = async (
  page,
  url,
  host,
  outputRoot,
  delayTime,
  htmlPrefix,
  domain
) => {
  await page.goto(url, { timeout: 10 * 1000 });

  await delay(delayTime);

  const htmlString = await page.evaluate(() => {
    if (document.contentType !== 'text/html') {
      return {
        error: 'page is not text/html type',
      };
    }
    return document.documentElement.innerHTML;
  });

  if (htmlString.error) {
    throw new Error(`${url} ${htmlString.error}`);
  }

  let path = url.replace(host, '');
  if (path[path.length - 1] === '/') {
    //if end with / (point to index.html)
    path += 'index.html';
  } else if (path.split('/').reverse()[0].split('.').length === 1) {
    //if not specify file extension
    path += '/index.html';
  }

  const outputPath = outputRoot + path;
  const outputDir = iife(() => {
    const dirs = `${outputPath}`.split('/');
    dirs.splice(dirs.length - 1, 1);

    return dirs.join('/');
  });
  
  createDirs(outputDir);

  await new Promise((rs) => {
    fs.writeFile(outputPath, htmlPrefix + htmlString.replace(new URL(url).origin, domain), (e) => {
      if (e) {
        console.error(e);
        throw new Error('Cannot write crawler output file to webroot path');
      } else {
        rs();
      }
    });
  });
};

const startCrawler = async (
  host,
  urls,
  outputRoot,
  delayTime,
  userAgent,
  htmlPrefix,
  pageCount,
  retryCount,
  domain,
  puppeterOpts
) => {
  console.log('Crawling: start');

  const browser = await puppeteer.launch(puppeterOpts);

  const pathnames = urls.slice();
  const getNextFullUrl = () => {
    const pathname = pathnames.shift();
    if (!pathname) {
      return null;
    }
    return host + pathname;
  };

  //use multi page
  await Promise.all(
    Array(pageCount)
      .fill(0)
      .map(() => {
        return new Promise(async (rs) => {
          const page = await browser.newPage();
          await page.setUserAgent(userAgent);

          let url = getNextFullUrl();
          while (url) {
            console.log('Crawling: [Start] ', url);

            let tryCount = 0;
            while (tryCount <= retryCount) {
              tryCount++;
              try {
                await crawlingOnePage(
                  page,
                  url,
                  host,
                  outputRoot,
                  delayTime,
                  htmlPrefix,
                  domain
                );
              } catch (e) {
                console.error('Crawling: [Error] ', url);
                console.error(e);

                if (tryCount > retryCount) {
                  throw e;
                } else {
                  console.log('Crawling: [Retry] ', url);
                }
              }
            }

            console.log('Crawling: [Finished] ', url);

            url = getNextFullUrl();
          }
          rs();
        });
      })
  );

  await browser.close();

  console.log('Crawling: end');
};

module.exports = startCrawler;
