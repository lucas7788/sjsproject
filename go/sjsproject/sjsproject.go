package main


import (
        "crypto/x509"
       "encoding/pem"
       "encoding/json"
	"fmt"
	"strconv" 
	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}
type MoneyAccount struct{
	usableMoney int
	frozenMoney int
}


func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface) pb.Response  {
        fmt.Println("########### example_cc Init ###########")
	return shim.Success(nil)


}

// Transaction makes payment of X units from A to B
func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface) pb.Response {
        fmt.Println("########### example_cc Invoke ###########")
	function, args := stub.GetFunctionAndParameters()
	
	if function != "invoke" {
                return shim.Error("Unknown function call")
	}

	if len(args) < 2 {
		return shim.Error("Incorrect number of arguments. Expecting at least 2")
	}

	if args[0] == "initMoneyAccount" {
		// Deletes an entity from its state
		return t.initMoneyAccount(stub, args)
	}

	
	return shim.Error("Unknown action, check the first argument, must be one of 'delete', 'query', or 'move'")
}
//orgName username in/out money
func (t *SimpleChaincode) initMoneyAccount(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	if len(args) != 4 {
		return shim.Error("Incorrect number of arguments. Expecting 1")
	}
	orgName:=args[0]
	username:=args[1]
	f:=args[2]
	money:=args[3]
    if orgName==""||username==""||f==""||money==""{
        return shim.Error("params can not be nil")
    }
	money,error:=strconv.Atoi(money)
    if error!=nil {
    	return shim.Error("money is wrong")
    }
    //moneyAccount {"usableMoney":"","frozenMoney":""}
    mAccount,err:=stub.GetState(orgName+username);
    if err!=nil{
    	return shim.Error("failed to get state")
    }
    var moneyAccount MoneyAccount
    json.Unmarshal(mAccount,&moneyAccount) 
    if f=="in"{
    	moneyAccount.usableMoney+=money
    }
    else if f=="out"{
    	if moneyAccount.usableMoney<money{
    	    return shim.Error("the out money is more than usableMoney")
    	}
    	moneyAccount.usableMoney-=money
    }else{
    	return shim.Error("initialize funtion must be in or out")
    }
    moneyAccount,err:=json.marshal(&moneyAccount)
    if err!=nil{
    	return shim.Error("transfer moneyAccount failed")
    }
    err:=stub.PutState(orgName+username,moneyAccount)
	if err != nil {
		return shim.Error("Failed to put state")
	}
	return shim.Success(nil)
}
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface) pb.Response {
		return shim.Error("Unknown supported call")
}
func (t *SimpleChaincode) getCreator(stub shim.ChaincodeStubInterface,args []string) pb.Response{
    creator,err:=stub.GetCreator()
    if err!=nil {
    	return shim.Error("error")
    }
     certDERBlock,_:=pem.Decode(creator[12:])
     if certDERBlock==nil{
        return shim.Error("Decode  failed")
     }
     x509Cert,err:=x509.ParseCertificate(certDERBlock.Bytes)
     if err!=nil {
      fmt.Println("parse certificate failed")
      return shim.Error("parse certificate failed")
     }
     issuer:=x509Cert.Issuer.CommonName
     subject:=x509Cert.Subject.CommonName
     jsonResp:="{\"issuer\":\""+issuer+"\",\"subject\":\""+subject+"\"}"
     return shim.Success([]byte(jsonResp))
}

func (t *SimpleChaincode) move(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	// must be an invoke
	var A, B string    // Entities
	var Aval, Bval int // Asset holdings
	var X int          // Transaction value
	var err error

	if len(args) != 4 {
		return shim.Error("Incorrect number of arguments. Expecting 4, function followed by 2 names and 1 value")
	}

	A = args[1]
	B = args[2]

	// Get the state from the ledger
	// TODO: will be nice to have a GetAllState call to ledger
	Avalbytes, err := stub.GetState(A)
	if err != nil {
		return shim.Error("Failed to get state")
	}
	if Avalbytes == nil {
		return shim.Error("Entity not found")
	}
	Aval, _ = strconv.Atoi(string(Avalbytes))

	Bvalbytes, err := stub.GetState(B)
	if err != nil {
		return shim.Error("Failed to get state")
	}
	if Bvalbytes == nil {
		return shim.Error("Entity not found")
	}
	Bval, _ = strconv.Atoi(string(Bvalbytes))

	// Perform the execution
	X, err = strconv.Atoi(args[3])
	if err != nil {
		return shim.Error("Invalid transaction amount, expecting a integer value")
	}
        if X ==0 {
           return shim.Error("the divisor can't be zero")
        }
	Aval = Aval + X
	Bval = Bval - X
	fmt.Printf("Aval = %d, Bval = %d\n", Aval, Bval)

	// Write the state back to the ledger
	err = stub.PutState(A, []byte(strconv.Itoa(Aval)))
	if err != nil {
		return shim.Error(err.Error())
	}

	err = stub.PutState(B, []byte(strconv.Itoa(Bval)))
	if err != nil {
		return shim.Error(err.Error())
	}

        return shim.Success([]byte(strconv.Itoa(Aval)));
}

// Deletes an entity from state
func (t *SimpleChaincode) delete(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	if len(args) != 1 {
		return shim.Error("Incorrect number of arguments. Expecting 1")
	}

	A := args[1]

	// Delete the key from the state in ledger
	err := stub.DelState(A)
	if err != nil {
		return shim.Error("Failed to delete state")
	}

	return shim.Success(nil)
}

// Query callback representing the query of a chaincode
func (t *SimpleChaincode) query(stub shim.ChaincodeStubInterface, args []string) pb.Response {

	var A string // Entities
	var err error

	if len(args) != 2 {
		return shim.Error("Incorrect number of arguments. Expecting name of the person to query")
	}

	A = args[1]

	// Get the state from the ledger
	Avalbytes, err := stub.GetState(A)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for " + A + "\"}"
		return shim.Error(jsonResp)
	}

	if Avalbytes == nil {
		jsonResp := "{\"Error\":\"Nil amount for " + A + "\"}"
		return shim.Error(jsonResp)
	}

	jsonResp := "{\"Name\":\"" + A + "\",\"Amount\":\"" + string(Avalbytes) + "\"}"
	fmt.Printf("Query Response:%s\n", jsonResp)
	return shim.Success(Avalbytes)
}

func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}
