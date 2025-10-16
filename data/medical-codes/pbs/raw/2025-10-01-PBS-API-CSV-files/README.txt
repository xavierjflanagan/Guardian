

PBS PUBLIC Production Data
    www.pbs.gov.au
    
(last edited July 5, 2024)


Content of the Text files
-------------------------

items
=====
  The primary data file, this includes much of the Items detail.



amt-items
=========
  PBS concept IDs: MPP, TPP etc mapped to the equivalent Australian Medicines
  Terminology, AMT codes and preferred terms.
 
atc-codes
=========
  Anatomical Therapeutic Chemical (ATC) Codes and hierarchy mapping drugs to
  the appropriate body system.
 
container-organisation-relationships
====================================
  Relationships between wholesalers/suppliers and the containers they use
  for extemporaneous benefits.
 
containers
===========
  Lists the container subsidies for preparing extemporaneous benefits.
 
copayments
==========
  Lists the different Safety Net copayment amounts which apply to general
  and concessional patients.
 
criteria
========
  Lists the different circumstance requirements: treatment, population
  and clinical, that form the headings of restriction text.
 
criteria-parameter-relationships
================================
  This entity specifies the parameters for each Criteria.
 
dispensing-rules
================
  Dispensing rules – for example: general schedule, section 100-highly
  specialised drugs – links to the Item table. A program code, links each
  Item to a program.
 
extemporaneous-ingredients
==========================
  List of extemporaneous ingredients applicable to Items, including a
  unique code, and price per weight.

extemporaneous-preparations
===========================
  List of extemporaneous preparations applicable to Items, including a
  unique code, and preparation description.

extemporaneous-prep-sfp-relationships
=====================================
  Uses the PBS_CODE value to link Extemporaneous_Preparation records
  to Standard_Formula_Preparation records.
 
extemporaneous-tariffs
======================
  Tariffs applicable to extemporaneous preparations.

fees
====
  The fees, charges and patient contributions that contribute to the
  price of a pharmaceutical item at the time of dispensing. All are
  in addition to the cost of the item itself.
 
indications
===========
  There is only one Indication per Restriction, so specifying multiple
  Indications requires multiple Restrictions. The Indication refers to
  what the patient presents as symptoms to support a diagnosis.
 
item-atc-relationships
======================
  Represents the relationships between Items and ATC Codes.

item-dispensing-rule-relationships
==================================
  Represents the many-to-many relationships between Items and
  Dispensing Rules.
 
item-organisation-relationships
===============================
  Represents the relationship between an Item and an Organisation.

item-prescribing-text-relationships
===================================
  Represents the relationship between an Item and a Prescribing Text.

item-pricing-events
===================
  Pricing events for Items.
 
item-restriction-relationships
==============================
  Represents the many-to-many relationships between Items and Restrictions.
 
markup-bands
============
  Contains the details of markups available to manufacturers within a PBS
  program. Mark-up is the sum of additional charges and costs necessary to
  recover production costs, and generate a profit for a product.
 
organisations
=============
  Organisations supply pharmaceuticals to the PBS system, they are also
  known as manufacturers, responsible persons, suppliers, wholesalers
  and companies.
 
parameters
==========
  These are qualifiers for the criteria, see the
  criteria-parameter-relationship.
 
prescribers
===========
  Lists the prescribers that apply to an item. A PBS item may have
  several prescribers.

prescribing-texts
=================
  Restrictions are also known as prescribing texts, and they can
  encompass informational text, such as notes and cautions.
 
programs
========
  A program code links each Item to a particular program.
 
restriction-prescribing-text-relationships
==========================================
  The relationship between Restrictions and Prescribing Text.
 
restrictions
============
  HTML format of the text for restrictions, notes and cautions,
  for use in the legislative instruments.
 
schedules
=========
  The 'full snapshots' of the effective data for a particular version.
 
standard-formula-preparations
=============================
  List of standard preparations for a particular PBS item.

