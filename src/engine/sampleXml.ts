/**
 * Sample ISO 20022 auth.030.001.04 DerivativesTradeReportV04 XML message
 * for testing the ASIC Derivative Reporting validation engine.
 *
 * This sample intentionally contains a mix of:
 *  - Valid fields (to show PASS results)
 *  - Invalid fields (to show FAIL results)
 *  - Missing conditional fields (to show N/A results)
 */
export const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DerivsTradRpt xmlns="urn:iso:std:iso:20022:tech:xsd:auth.030.001.04">
  <RptHdr>
    <RptgDtTm>2025-01-15T10:30:00+11:00</RptgDtTm>
  </RptHdr>
  <TradData>
    <New>
      <!-- Transaction Identification -->
      <TxId>
        <UnqTradIdr>5493001KJTIIGC8Y1R12ABCDEF123456</UnqTradIdr>
      </TxId>

      <!-- Counterparty Specific Data -->
      <CtrPtySpcfcData>
        <!-- Counterparty 1 (Reporting Entity) -->
        <RptgCtrPty>
          <Id>
            <Lgl>
              <LEI>5493001KJTIIGC8Y1R12</LEI>
            </Lgl>
          </Id>
          <Drctn>
            <DrctnOfTheFrstLeg>BYER</DrctnOfTheFrstLeg>
          </Drctn>
          <DrclyLkdActvty>false</DrclyLkdActvty>
        </RptgCtrPty>

        <!-- Counterparty 2 — intentionally uses INVALID LEI format to trigger validation -->
        <OthrCtrPty>
          <Id>
            <Lgl>
              <LEI>INVALIDLEI12345</LEI>
            </Lgl>
          </Id>
          <Ctry>AU</Ctry>
        </OthrCtrPty>

        <!-- Beneficiary -->
        <Bnfcry>
          <Id>
            <Lgl>
              <LEI>2138005YDSA7A1B3LN30</LEI>
            </Lgl>
          </Id>
        </Bnfcry>
      </CtrPtySpcfcData>

      <!-- Common Trade Data -->
      <CmonTradData>
        <!-- Product Data -->
        <PdctData>
          <UPI>QZ1234567890</UPI>
          <Clssfctn>
            <Cd>SRACSP</Cd>
          </Clssfctn>
          <CtrctTp>SWAP</CtrctTp>
          <AsstClss>INTR</AsstClss>
        </PdctData>

        <!-- Dates and Timestamps -->
        <ExctnDtTm>2025-01-15T09:30:00+11:00</ExctnDtTm>
        <FctvDt>2025-01-17</FctvDt>
        <XpryDt>2030-01-17</XpryDt>
        <!-- Intentionally INVALID maturity date (before effective) to trigger cross-field validation -->
        <MtrtyDt>2024-12-01</MtrtyDt>
        <RptgDtTm>2025-01-15T10:30:00+11:00</RptgDtTm>

        <!-- Clearing — Cleared = Y but missing CCP LEI to trigger validation -->
        <TradClr>
          <ClrSts>
            <Clrd>
              <Dtls>
                <CCP>
                  <LEI></LEI>
                </CCP>
              </Dtls>
            </Clrd>
          </ClrSts>
        </TradClr>

        <!-- Execution Venue -->
        <TradgVn>
          <Id>XASX</Id>
        </TradgVn>

        <!-- Master Agreement -->
        <MstrAgrmt>
          <Tp>
            <Cd>ISDA</Cd>
          </Tp>
        </MstrAgrmt>

        <!-- Notional Amounts -->
        <NtnlAmt>
          <Amt>
            <FrstLeg>10000000.00</FrstLeg>
            <ScndLeg>notanumber</ScndLeg>
          </Amt>
          <Ccy>
            <FrstLeg>AUD</FrstLeg>
            <ScndLeg>USD</ScndLeg>
          </Ccy>
        </NtnlAmt>

        <!-- Price -->
        <Pric>
          <Dcml>0.0325</Dcml>
          <Ccy>AUD</Ccy>
        </Pric>

        <!-- Package -->
        <PckgData>
          <Id>PKG-2025-001</Id>
        </PckgData>
      </CmonTradData>

      <!-- Technical Attributes -->
      <TechAttrbts>
        <EvtTp>TRAD</EvtTp>
      </TechAttrbts>

      <!-- Collateral Data -->
      <CollData>
        <PrtflCd>
          <Id>COLL-PTF-001</Id>
        </PrtflCd>
        <InitlMrgnPstd>
          <Amt>500000.00</Amt>
        </InitlMrgnPstd>
        <VartnMrgnPstd>
          <Amt>125000.50</Amt>
        </VartnMrgnPstd>
      </CollData>

      <!-- Valuation Data -->
      <ValtnData>
        <MrkToMktVal>
          <Amt>-234567.89</Amt>
          <Ccy>AUD</Ccy>
        </MrkToMktVal>
        <ValtnDtTm>2025-01-15T16:00:00+11:00</ValtnDtTm>
        <!-- Intentionally INVALID delta (>1) to trigger validation -->
        <Dlt>1.5</Dlt>
      </ValtnData>
    </New>
  </TradData>
</DerivsTradRpt>`;
