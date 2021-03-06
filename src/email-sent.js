'use strict';

const fs = require('fs-extra');
const nodemailer = require('nodemailer');
const mustache = require('mustache');
const jwt = require('jsonwebtoken');
const { URL } = require('url');
const parseDomain = require('parse-domain');
const key = require('./get-jwt-key.js')();
const amministrazioni = require('../public/assets/data/authorities.db.json');

module.exports = function (request) {
  const referente = request.payload.nomeReferente;
  const ipa = request.payload.ipa;
  const url = request.payload.url;
  const pec = amministrazioni[ipa].pec;
  const amministrazione = amministrazioni[ipa].description;

  if(!isValid(url)) {
    return `La url ${url} non e' valida`;
  } 

  // Generate test SMTP service account from ethereal.email
  // Only needed if you don't have a real mail account for testing
  nodemailer.createTestAccount((err, account) => {
    // create reusable transporter object using the default SMTP transport
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: account.user, // generated ethereal user
        pass: account.pass // generated ethereal password
      }
    });

    const template = fs.readFileSync('src/tpl/email.mst').toString('utf8');

    const token = jwt.sign({
      referente: referente,
      ipa: ipa,
      url: url
    }, key);

    // setup email data with unicode symbols
    const mailOptions = {
      from: '"Team Digitale" <test@teamdigitale.com>', // sender address
      to: 'giuseppesantoro87@gmail.com', // list of receivers
      subject: 'Onboarding Developer Italia', // Subject line
      html: mustache.render(template, {
        referente: referente,
        url: url,
        amministrazione: amministrazione,
        link: `http://localhost:3000/registered?token=${token}`
      })
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.error(error);
      }
      console.log('Message sent: %s', info.messageId);
      // Preview only available when sending through an Ethereal account
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    });
  });

  return `Abbiamo inviato il link con cui confermare l'iscrizione tramite email all'indirizzo ${pec}.`;
};

/**
 * Controlla se l'URL e' ben formata e se il nome del dominio rientra in una whitelist di url.
 * 
 * @param url rappresenta l'url da controllare
 * 
 * @return true se la URL e' ben formata e se ientra in una whitelist, false altrimenti
 */
function isValid(url) {
  const generalRegex = /^(https?):\/\/(www\.)?([a-z]+)(\.([\da-zA-Z-]+)){1,2}(\/[\da-zA-Z-]+)*\/?$/;

  return generalRegex.test(url) && isInWhiteList(url);
}

/**
* Controlla se il dominio della URL passata rientra in una whitelist di domini 
* 
* @param url rappresenta l'url da controllare
* 
* @return true se l'url e' presente nella whitelist, false altrimenti
*/
function isInWhiteList(url) {
  let result = false;
  const dictionary = {
      'github': /^(https?):\/\/(github\.com)\/([\da-zA-Z-_])*\/?$/,
      'bitbucket': /^(https?):\/\/(bitbucket\.org)\/([\da-zA-Z-_])*\/?$/,
      'gitlab': /^(https?):\/\/(gitlab\.com)\/([\da-zA-Z-_]+)\/?$/,
      'phabricator': /^(https?):\/\/(secure\.phabricator\.com)\/(p)\/([\da-zA-Z-_]+)\/?$/,
      'gitea' : /^(https?):\/\/(try\.gitea\.io)\/([\da-zA-Z-_]+)\/?$/,
      'gogs' : /^(https?):\/\/(try\.gogs\.io)\/([\da-zA-Z-_]+)\/?$/
  };

  const arrayUrl = [
      "https://github.com/",
      "https://bitbucket.org/",
      "https://gitlab.com/",
      "https://phabricator.com/",
      "https://gitea.io/",
      "https://gogs.io/"
  ];

  const urlParsed = new URL(url);
  const protocol = urlParsed.protocol;
  const hostname = urlParsed.hostname;
  
  const domainParsed = parseDomain(url);
  if (domainParsed != null) {
      const domain = domainParsed.domain;

      const regex = dictionary[domain];
      const isValid = regex && regex.test(url); 

      let baseUrl = '';

      /*  Gli url nella forma  https://try.gogs.io/<username>/<projectname>,  
                              https://try.gitea.io/<username>/<projectname>, 
                              https://secure.phabricator.com/project/view/395/
          devono diventare    https://gogs.io/<username>/<projectname>,  
                              https://gitea.io/<username>/<projectname>, 
                              https://phabricator.com/project/view/<numProject>/
      */
      if(["gitea", "gogs", "phabricator"].includes(domain)) {
          baseUrl = `${protocol}//${domain}.${domainParsed.tld}/`;
      } else {
          baseUrl = `${protocol}//${hostname}/`;
      }

      result = isValid && arrayUrl.includes(baseUrl);
  }
  return result;
}