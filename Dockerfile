# Image de base
FROM centos:centos7 as base
RUN yum update -y
RUN yum groupinstall 'Development Tools' -y

FROM base as nodejs-base
RUN curl --silent --location https://rpm.nodesource.com/setup_14.x | bash -
RUN yum -y install nodejs npm nvm

FROM nodejs-base
COPY src /marketfeeds
WORKDIR /marketfeeds
RUN npm install  -f --save-optional
ENTRYPOINT ["/usr/bin/node", "exchange_prices.js"]